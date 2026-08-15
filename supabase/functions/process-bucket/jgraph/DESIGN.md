# Conversation Brain — Design

> Last updated: 2026-07-20. This document describes the **current** architecture
> (the `engine.ts` slot-filling brain) and the reasoning behind each decision.
> The end of the doc has a per-change log of the bugs found and fixed while
> hardening it.

---

## 1. Why we rebuilt it

The old engine (`nodes_v2.ts`) stored a `conversation_state` string as the
source of truth for "what to do next." Every turn was interpreted through the
keyhole of the current state, so the system only ever looked for the one field
that state cared about. Real conversations are non-linear — people over-answer,
correct themselves, answer a different question than the one asked, add
materials late — and every one of those was "off the rails." Symptoms we saw in
production:

- **No backtracking.** Once in `confirming_project`, the only inputs that
  existed were `CONFIRMED` / `NO`; "wait, make it 6 hours" fell through to
  "unclear → ask again → force default."
- **Extraction fought the FSM.** Confirm states deliberately froze every slot
  except the project, so a correction during confirmation was discarded by
  design.
- **Silent fabrication.** After 2 failed attempts it invented
  `workType:'work', hours:2` and logged it — the worst failure mode for a system
  of record.
- **Regex clashed with intent.** `match(/(\d+)\s*hours?/)` treated "3" (project
  #3) as 3 hours.
- **Obsolete model + dead code.** `nodes_v2.ts` still called
  `meta-llama/llama-4-scout`, and `state.ts` / `guards.ts` defined a state model
  nothing imported.

---

## 2. The reframe: the record is the truth

This is **slot-filling**, not a linear flow. We invert what's authoritative:

- A structured **`WorkRecord`** (slots + statuses) is the only persisted state
  (`buckets.extracted_data`). `conversation_state` is written for observability
  only.
- **"What to ask next" is a pure function of the record** (`decideNextAction`),
  recomputed each turn. There is no stored state node to get stuck in, so
  corrections work everywhere.
- Each turn interprets the user's reply **in the context of what we just
  asked**, produces a **patch + intent**, applies it to the record, then
  recomputes the next action.

---

## 3. The core principle: expected action in, no hallucination

**When the app asks a question, that question defines an expected action, and
the reply is _input to that action_ — nothing more.** The system must not
re-derive unrelated fields from a reply, and must not error out on extra or
"wrong" info.

Two rules enforce this:

### 3a. Input is scoped to _this_ turn (the watermark)

The record carries `seenTextLines` and `seenTranscripts`. Each turn reads
**only** the text lines / transcripts that arrived _after_ the watermark, then
advances it:

```
newTextLines   = textLines.slice(record.seenTextLines)
newTranscripts = transcripts.slice(record.seenTranscripts)
reply          = (newText || newTranscript).trim()
record.seenTextLines = textLines.length; record.seenTranscripts = transcripts.length
```

Without this, a voice note from turn 1 was re-fed into the interpreter on every
later turn, causing phantom re-extraction (e.g. a stale "City Mall" reappearing
as `location`). Now a prior message can never be re-interpreted.

### 3b. Interpretation and resolution are conditioned on the state

Depending on what we last asked (`record.lastAsked`), the reply is resolved by
the _cheapest sufficient_ mechanism. Closed questions resolve
**deterministically, with no LLM**; only genuinely open input goes to a focused
LLM call.

| We last asked (`lastAsked`)        | Expected input               | How the reply is resolved                                                                            |
| ---------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `project` (numbered list)          | a number or a name           | **Deterministic** `resolveProjectReply` — pure number → list index; else fuzzy name match            |
| `hours`                            | a number                     | **Deterministic** `parseHoursReply` — first number in 0<h≤24; else → LLM                             |
| `fix` ("work, hours, or project?") | a field name, or a new value | **Deterministic** `detectFixFieldOnly` for a bare field name; a value → focused LLM (`interpretFix`) |
| `confirm` ("Reply Y or N")         | yes / no / a correction      | Focused LLM (`interpretConfirm`) — reliably classifies bare Y/N + corrections                        |
| `work`, `greet`, `clarify`, fresh  | open description             | Full extraction LLM (`interpretExtraction`)                                                          |

> **Why the deterministic paths are not the "hardcoded yes/no" we rejected.**
> Matching a reply to an option **we just showed the user** ("1", "2", or "the
> project") is resolving the literal expected input to the question asked — not
> guessing intent from a hardcoded synonym list. Yes/no at `confirm` is nuanced
> (any phrasing, any language, audio) and stays with the LLM.

---

## 4. The turn loop (`engine.ts`)

```
bucket   = load(bucketId); member, projects, inbox = load(...)
record   = loadRecord(bucket)                 // parse extracted_data (+ legacy shape)
record   = prefillProject(record, member)     // reuse fresh (<8h) confirmed project as candidate
transcribe any NEW audio; analyze image (only if we still need work type)

# 3a — this turn's input only
reply    = newTextLines + newTranscripts (past the watermark); advance watermark

# 3b — expected-action resolution
switch (record.lastAsked):
  'project' → resolveProjectReply(reply)          # deterministic
  'hours'   → parseHoursReply(reply)              # deterministic
  'fix'     → detectFixFieldOnly(reply)           # deterministic (bare field name)
if not resolved deterministically:
  interp  = interpretTurn(record, lastAsked, reply, media)   # focused LLM per state
  projRef = resolveProjectRef(interp, projects)   # + fuzzy fallback ONLY when naming a project
  record  = applyPatch(record, interp, projRef)   # corrections land here

if !projectId && !projectRejected → attach Inbox   # best-effort project
action   = decideNextAction(record)               # pure fn
if SELECT_PROJECT and >MAX_ASK tries → attach Inbox instead
action   = enforceAttemptCap(action, record)      # too many tries on work/hours → FLAG_FOR_REVIEW

→ SUBMIT: write txn, remember project on member (unless Inbox), send success
→ FLAG:   status = pending_review (never fabricate)
→ else:   send templated question; record.lastAsked = slotOf(action); save
```

There is no `collecting_hours` vs `confirming_project` branching to fall out of.
"User corrected hours during confirmation" isn't a special case: the patch
updates `hours`, `decideNextAction` sees the record is no longer confirmed, and
it re-confirms.

---

## 5. Interpretation: three focused interpreters (`interpret.ts`)

`interpretTurn` dispatches on `lastAsked`. **All three return the same
`TurnInterpretation` patch shape** (§6), so the reducer downstream is uniform.
Focusing the prompt to the state is what makes a bare "N" or "project" resolve
reliably — a single generic "extract everything" prompt was dropping the one
field that mattered.

- **`interpretConfirm`** (state `confirm`) — model: `openai/gpt-oss-20b`, ~300
  tokens. Decides `confirm` / `reject` / `correct`. A bare
  "Y"/"N"/"yes"/"no"/"sí" is classified by meaning (not a word list). If they
  name what's wrong, it sets `rejectField`; if they state a new value, it sets
  that slot with `intent:'correct'`.
- **`interpretFix`** (state `fix`) — model: `openai/gpt-oss-20b`, ~200 tokens.
  Runs **only for value replies** ("6 hours", "it was plumbing", a project name)
  — the bare field-name case is already handled deterministically in the engine.
  Extracts the field + its new value and always carries the field as
  `rejectField` so `applyPatch` either applies the value or clears the slot to
  re-ask.
- **`interpretExtraction`** (open states) — model: `openai/gpt-oss-20b`, ~1500
  tokens. The genuinely open case: full extraction of work type, hours,
  materials, location, summary, project hint, consistency. This is the one place
  the big prompt belongs.

**Model choice.** `gpt-oss-20b` is a reasoning model (needs
`reasoning_effort:'low'` or it burns its token budget on hidden reasoning and
returns empty JSON) — good for rich extraction. For the small yes/no/field
decisions we use the `openai/gpt-oss-20b` **instruct** model, which is far more
reliable on bare tokens and cheaper. `io.ts` `groqJson` takes a per-call
`model`, and only sends `reasoning_effort` to gpt-oss models.

On any LLM failure, the interpreters return a conservative **no-op** patch
(never a fabricated `confirm`); the engine simply re-asks.

---

## 6. `TurnInterpretation` (the patch shape)

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

Only fields the message actually touches are set — everything else is left
unchanged in the record. Corrections REPLACE a slot; materials ADD; a changed
slot un-confirms the record.

---

## 7. `applyPatch` reducer (`record.ts`, pure)

Applies one interpretation to the record. Key semantics:

- Work / hours / location / summary: replace when the patch provides a value;
  changing a confirmed slot sets `confirmed = false`.
- Materials: additive + de-duped.
- Project: a resolved `ProjectRef` wins; changing a confirmed project
  un-confirms.
- **Confirmation/rejection is interpreted at BOTH `confirm` and `fix`**
  (`rec.lastAsked === 'confirm' || 'fix'`):
  - `confirm` → `confirmed = true`.
  - `rejectField:'project'` with no resolved project → clear project, set
    `projectRejected` (→ picker).
  - `rejectField:'hours'` / `'work'` with no new value → clear that slot (→
    re-ask).
  - `rejectField:'all'` / `intent:'reject'` **only at `confirm`** with no value
    → `needsFix` (→ ASK_FIX "what should I change?").

Handling the reject at `fix` too is what lets "N → ASK_FIX → project" reach the
picker instead of looping back to CONFIRM.

---

## 8. `decideNextAction` (pure)

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

`location`, `summary`, `materials` are **never** gates — they ride along as
annotations and can hold "wrong" values without blocking or conflicting with
anything (e.g. `location:"City
Mall"` alongside a DB-resolved
`project:"Downtown Office Renovation"` is a valid state; the two fields are
orthogonal — `location` is free text, `project` is a foreign key).

---

## 9. Project matching (`match.ts`, pure)

Project names are **dynamic DB data**, so matching them fuzzily is not the same
as hardcoding intent words. `match.ts` is pure (no I/O) and unit-tested.

- **`fuzzyFindProject`** — token + Levenshtein similarity (threshold 0.6),
  tolerant of typos ("City hall" → "City Mall"), extra words, and partial names
  ("the mall" → "City Mall").
- **Bounded substring.** The "one string contains the other" shortcut requires
  the substring to be **≥3 chars and land on a word boundary**
  (`boundedIncludes`). Without this, a bare "n"/"no" substring-matched any
  project containing the letter (e.g. "Dow**n**town"), which silently cancelled
  rejections — a deterministic CONFIRM loop.
- **The raw-reply fuzzy fallback only runs when the user is actually naming a
  project.** In the engine, after a focused interpretation, we fuzzy-match the
  _raw reply_ against the project list **only** when
  `intent ∈ {correct, select, provide}` — never on a confirm/reject. A rejection
  stays a rejection.
- **`resolveProjectReply`** (deterministic list answer) — a _pure_ number picks
  by position; otherwise fuzzy-match the name. "5 hours" is never read as
  project #5.
- **`detectFixFieldOnly`** — maps a reply that only NAMES a field ("project",
  "change the hours", "wrong project") to that field, ignoring filler; returns
  null when a value is present so the value goes to the LLM.

---

## 10. Project is best-effort; Inbox is the fallback

Work + hours are the only **required** slots (`REQUIRED_SLOTS`). Project is
inferred from what the user said or their fresh (<8h) recent project — otherwise
the engine attaches the node's **Inbox** project and moves on. That's the point
of Inbox: unattributed work still gets logged, no nagging. The numbered picker
only appears when the user _explicitly rejects_ the attributed project, and even
that falls back to Inbox after `MAX_ASK` tries.

Note: new buckets are created with `project_id = Inbox` (webhook default), so
`loadRecord` deliberately ignores `bucket.project_id` — the real choice
round-trips through the record.

---

## 11. Failure mode (chosen default)

For a system of record, a wrong-but-clean log is worse than an incomplete one.
After `MAX_ASK` (**3**) attempts on a **required** slot (work/hours) we **flag**
the ticket (`status = pending_review`) and stop asking — we never invent data.
Project is exempt: it falls back to Inbox rather than flagging. Tunable via
`MAX_ASK`.

---

## 12. Cost

- **Open turn (describe work):** 1 call to `gpt-oss-20b` (also absorbs the
  image/text consistency check, so image turns are 1 call, not 2).
- **Confirm turn:** 1 small call to `openai/gpt-oss-20b` (~300 tokens).
- **Fix turn:** deterministic (field name) = **0 calls**; value reply = 1 small
  `openai/gpt-oss-20b` call (~200 tokens).
- **Project pick / hours answer:** deterministic = **0 calls**.
- **Replies:** templated = 0 calls. **Submit:** +1 translation call only for
  Spanish summaries.

Net: cheaper than the old engine — the most common structured replies (Y/N, a
number, a field name) are either a tiny instruct call or no call at all, and we
never run a big extraction on a one-token reply.

---

## 13. Files

- `record.ts` — `WorkRecord`, `TurnInterpretation`, `Action`, `Slot`; pure
  `applyPatch`, `decideNextAction`, `loadRecord`, `enforceAttemptCap`, `slotOf`,
  watermark fields. No I/O.
- `match.ts` — pure matching: `fuzzyFindProject`, `resolveProjectReply`,
  `parseHoursReply`, `detectFixFieldOnly`, `resolveProjectRef`. No I/O —
  unit-tested.
- `interpret.ts`— `interpretTurn` dispatch → `interpretConfirm` / `interpretFix`
  / `interpretExtraction`, each with its own focused prompt.
- `io.ts` — Supabase client, Twilio send, Groq JSON/text helpers (per-call
  model), Whisper transcribe, vision analyze, translate, `withTimeout`.
- `reply.ts` — bilingual (en/es) templates + `composeReply` / `composeSuccess`.
- `engine.ts` — `runStateMachine` orchestration: load, watermark, deterministic
  resolution, interpret, apply, decide, act, submit.
- `graph.ts` — thin `runBrain` wrapper. **Live entry:**
  `index.ts → graph.ts → engine.ts`.

### ⚠ Deployment gotcha (important)

`index.ts` imports `runBrain` from `graph.ts`, and **`graph.ts` must import
`runStateMachine` from `./engine.ts`.** If it points at `./nodes_v2.ts` (the old
scout engine), none of this design runs and production silently reverts. This
exact mis-import happened (a `supabase functions download` into the working tree
overwrote `graph.ts`), which is why fixes appeared not to work. `nodes_v2.ts`,
`state.ts`, `guards.ts` are superseded and should be **deleted** so `graph.ts`
can never point back at them. Deploy with
`supabase functions deploy process-bucket`.

---

## 14. Change log — hardening (2026-07-20)

Each item is a real bug found in live testing and its fix, with a regression
test.

1. **Reject at the fix step was a dead end.** `applyPatch` only interpreted
   `rejectField` when `lastAsked === 'confirm'`, so "N → ASK_FIX → 'project'"
   had nowhere to land and looped back to CONFIRM. → Handle reject/correct at
   both `confirm` and `fix`.

2. **Stale audio replayed every turn.** `transcript` used the last transcript
   _ever_ instead of this turn's, so a turn-1 voice note was re-interpreted
   forever (phantom `location:"City
   Mall"`, unreliable single-token picks). →
   Input **watermark** (`seenTextLines`/ `seenTranscripts`); read only what
   arrived this turn.

3. **One generic prompt in every state.** A bare "N" was interpreted by the full
   extract-everything prompt and mis-classified. → **State-conditioned
   interpreters**; confirm/fix use the small `openai/gpt-oss-20b` instruct
   model.

4. **"n"/"no" fuzzy-matched a project.** The substring shortcut matched the
   letter "n" inside "Dow**n**town…", setting a project ref that cancelled the
   rejection → deterministic CONFIRM loop. → **Bounded substring** (≥3 chars,
   word boundary) **and** only run the raw-reply fuzzy fallback when the
   interpreter says the user is naming a project.

5. **Fix step reused the confirm prompt.** For "project"/"change project" the
   model returned `decision:"confirm"` (meaningless at `fix`) → no-op → loop. →
   **Split** into `interpretConfirm` / `interpretFix`; resolve the bare
   field-name deterministically (`detectFixFieldOnly`) and use a dedicated fix
   prompt for value replies.

6. **Obsolete model / wrong live path.** Production was running `nodes_v2.ts`
   with `meta-llama/llama-4-scout` because `graph.ts` imported it. → Restore
   `graph.ts → engine.ts`; plan to delete `nodes_v2.ts`.

### Open items for review

- **Delete `nodes_v2.ts` / `state.ts` / `guards.ts`** (dead once the import is
  correct).
- **Inconsistency clarification** (`CLARIFY_INCONSISTENCY`) is the only
  remaining soft gate — it pauses to ask when a photo clearly contradicts the
  stated trade. Decide whether to keep it as a gate or demote it to a silent
  note.
- **In-flight buckets across deploy:** an already-open conversation from before
  the watermark deploy starts at `seenTextLines: 0` and re-reads its history
  once on the first turn. New conversations are clean. Not special-cased.
