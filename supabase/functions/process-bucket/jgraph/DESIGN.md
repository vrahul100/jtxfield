# Conversation Brain — Hybrid Slot-Filling Design

## Why we rebuilt it

The v2 engine (`nodes_v2.ts`) stored a `conversation_state` string as the source of
truth for "what to do next." Every turn was interpreted through the keyhole of the
current state, so the system only ever looked for the one field that state cared about.
Real conversations are non-linear — people over-answer, correct themselves, answer a
different question than the one asked, add materials late — and every one of those was
"off the rails." Symptoms:

- **No backtracking.** Once in `confirming_project` the only things that existed were
  `CONFIRMED`/`NO`; "wait, make it 6 hours" fell through to "unclear → ask again → force default."
- **Extraction fought the FSM.** Confirm states deliberately froze every slot except the
  project, so a correction during confirmation was discarded by design.
- **Silent fabrication.** After 2 failed attempts it invented `workType:'work', hours:2`
  and logged it — the worst failure mode for a system of record.
- **Regex clashed with intent.** `match(/(\d+)\s*hours?/)` treated "3" (project #3) as 3 hours.
- **Dead code / schema drift.** `state.ts` + `guards.ts` defined a different state model
  that nothing imported.

## The reframe: the record is the truth

This is **slot-filling**, not a linear flow. We invert what's authoritative:

- A structured **`WorkRecord`** (slots + statuses) is the only persisted state
  (`buckets.extracted_data`).
- Every turn, one LLM call **interprets the whole message against the whole record** and
  returns a **patch + intent** — never "drives" the conversation.
- **"What to ask next" is a pure function of the record** (`decideNextAction`), recomputed
  each turn. There is no stored state node to get stuck in, so corrections work everywhere
  for free.

## Cost

**One LLM call per turn** — the interpret call *replaces* the old extraction call and also
absorbs the separate image/text consistency cross-check, so image turns go from 2 calls to
1. Replies are templated (0 calls). The only other model call is a summary translation on
final submit for Spanish users. Net: cheaper than v2.

## The turn loop (`engine.ts`)

```
record   = loadRecord(bucket)            // parse extracted_data (+ legacy shape)
record   = prefillProject(record, member)// reuse fresh (<8h) confirmed project as candidate
media    = transcribe new audio / analyze image (first turn only)
interp   = interpretTurn(record, lastAsked, latestUserMsg, media)   // 1 LLM call → patch+intent
projRef  = resolveProjectRef(interp, projects, lastAsked)           // name/number → project row
record   = applyPatch(record, interp, projRef)                      // corrections land here, always
save(record)                             // single write to extracted_data

action   = decideNextAction(record)      // pure fn
action   = enforceAttemptCap(action, record)   // too many tries on a data slot → FLAG_FOR_REVIEW
→ SUBMIT: write txn, send success
→ FLAG:   status = pending_review (never fabricate)
→ else:   send templated question, record.lastAsked = slot
```

There is no `collecting_hours` vs `confirming_project` branching to fall out of.
"User corrected hours during confirmation" isn't a special case: the patch updates `hours`,
`decideNextAction` sees the record is no longer confirmed, and it re-confirms.

## `interpretTurn` contract (the only LLM call)

Input: current record summary, what we last asked (so bare "yes"/"3" are interpretable),
the latest user message (text + voice transcript), image analysis, and the project list
when we're selecting. Output (strict JSON):

```jsonc
{
  "workType":   "electrical" | ... | null,   // present only if the message addresses it
  "hours":      number | null,               // words→numbers, "another 2"→2, "make it 4"→4
  "materials":  string[],                     // to ADD
  "location":   string | null,
  "summary":    string | null,
  "projectHint":string | null,               // free-text name OR a number the user picked
  "confirm":    boolean,                      // affirmed the thing we asked to confirm
  "rejectField":"work" | "hours" | "project" | "all" | null,  // what they rejected, if any
  "language":   "en" | "es",
  "isWorkRelated": boolean,
  "consistencyIssue": string | null,          // set if image clearly contradicts stated work
  "intent": "provide"|"correct"|"confirm"|"reject"|"select"|"question"|"chitchat"
}
```

Only fields the message actually touches are set — everything else is left unchanged in the
record. Corrections REPLACE a slot; materials ADD; a changed slot un-confirms the record.

## `decideNextAction` (pure)

```
!isWorkRelated && empty          → GREET
inconsistency                    → CLARIFY_INCONSISTENCY
!workType                        → ASK_WORK
!hours                           → ASK_HOURS
projectRejected && !projectId    → SELECT_PROJECT   (only after an explicit rejection)
needsFix                         → ASK_FIX
!confirmed                       → CONFIRM
otherwise                        → SUBMIT
```

## Project is best-effort; Inbox is the fallback

Work + hours are the only **required** slots. Project is inferred from what the user said
(a project name) or their fresh (<8h) recent project — otherwise the engine attaches the
node's **Inbox** project and moves on. That's the point of Inbox: unattributed work still
gets logged, no nagging. The numbered picker only appears when the user *explicitly rejects*
the attributed project, and even that falls back to Inbox after `MAX_ASK` tries.

Note: new buckets are created with `project_id = Inbox` (webhook default), so `loadRecord`
deliberately ignores `bucket.project_id` — the real choice round-trips through the record.

## Failure mode (chosen default)

For a system of record, a wrong-but-clean log is worse than an incomplete one. After
`MAX_ASK` (3) attempts on a **required** slot (work/hours) we **flag** the ticket
(`status = pending_review`) and stop asking — we never invent data. Project is exempt: it
falls back to Inbox rather than flagging. Tunable via `MAX_ASK`.

## Files

- `record.ts`   — `WorkRecord`, `TurnInterpretation`, `Action`; pure `applyPatch`,
  `decideNextAction`, `loadRecord`, `slotOf`. No I/O — unit-testable.
- `io.ts`       — Supabase client, Twilio send, Groq JSON/text helpers, Whisper transcribe,
  vision analyze, translate, `withTimeout`.
- `interpret.ts`— `interpretTurn` (the one LLM call) + `resolveProjectRef`.
- `reply.ts`    — bilingual templates + `composeReply(action, record, extras)`.
- `engine.ts`   — `runStateMachine` orchestration + submit.
- `graph.ts`    — thin `runBrain` wrapper (unchanged entry point).

`nodes_v2.ts`, `state.ts`, `guards.ts` are superseded and can be deleted once this is live.
```