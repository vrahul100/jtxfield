// interpret.ts — The ONE LLM call per turn. Turns a user message into a patch + intent
// against the current record. Also resolves a project name/number to a real project row.

import type { Slot, TurnInterpretation, WorkRecord } from './record.ts'
import { groqJson, withTimeout } from './io.ts'
import type { ProjectOption } from './match.ts'

export type { ProjectOption } from './match.ts'
export { resolveProjectRef } from './match.ts'

interface InterpretInput {
    record: WorkRecord
    lastAsked: Slot | null
    userText: string          // latest text line from the user
    transcript: string        // latest voice transcript (if any)
    imageAnalysis: string     // vision output (first turn only)
    projects: ProjectOption[] // shown when we're selecting a project
}

function recordSummary(r: WorkRecord): string {
    return [
        `workType: ${r.workType ?? '—'}`,
        `hours: ${r.hours ?? '—'}`,
        `project: ${r.projectName ?? '—'}`,
        `materials: ${r.materials.join(', ') || '—'}`,
        `location: ${r.location ?? '—'}`,
    ].join('\n')
}

function askedContext(lastAsked: Slot | null, projects: ProjectOption[]): string {
    switch (lastAsked) {
        case null: return 'Nothing yet — this is a fresh message.'
        case 'greet': return 'We greeted them and asked them to describe their work.'
        case 'work': return 'We asked WHAT KIND OF WORK they did (and hours).'
        case 'hours': return 'We asked HOW MANY HOURS they worked.'
        case 'clarify': return 'We asked them to CLARIFY an apparent mismatch between the photo and the work described.'
        case 'fix': return 'We asked WHAT THEY WANT TO CHANGE. If they name a field — "work"/"hours"/"project" — set rejectField to it (e.g. "project" → rejectField="project") with intent "correct". If instead they give the new value directly ("City Mall", "6 hours", "it was plumbing"), set that slot.'
        case 'confirm': return 'We showed the full log (work, hours, project) and asked "Reply Y or N". A bare "Y"/"y"/"yes"/"yeah"/"correct"/"sí"/"ok"/"👍" → confirm=true, intent="confirm". A bare "N"/"n"/"no"/"nope" → confirm=false, rejectField="all", intent="reject". If they instead name what is wrong ("wrong project", "hours are off"), set rejectField to that field.'
        case 'project':
            return `We showed them a NUMBERED project list and asked them to pick one:\n${projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}\nA bare number selects that project.`
    }
}

function buildPrompt(input: InterpretInput): string {
    const { record, lastAsked, userText, transcript, imageAnalysis, projects } = input
    const userInput = [userText, transcript ? `[Voice] ${transcript}` : ''].filter(Boolean).join('\n') || '[no text — media only]'

    return `You are the interpreter for a construction work-logging assistant on WhatsApp.
Your ONLY job is to read the user's latest message IN CONTEXT and describe how it changes
the work log. You do NOT decide what to ask next.

## CURRENT LOG (what we have so far)
${recordSummary(record)}

## WHAT WE JUST ASKED
${askedContext(lastAsked, projects)}

## KNOWN PROJECTS
${projects.length ? projects.map(p => `- ${p.name}`).join('\n') : 'none on file'}

## IMAGE ANALYSIS (if any)
${imageAnalysis || 'none'}

## USER'S LATEST MESSAGE
${userInput}

---
## OUTPUT — return JSON ONLY. Include a slot field ONLY if this message addresses it;
omit or null it otherwise (do not repeat unchanged values).

{
  "workType": one of "electrical","plumbing","hvac","carpentry","roofing","masonry","painting","rebar","concrete","drain","general" | null,
  "hours": number | null,          // convert words→numbers (three→3, dos→2, "and a half"→+0.5). "another 2"/"2 more"→2. "make it 4"/"actually 4"→4.
  "materials": string[],           // materials to ADD, [] if none
  "location": string | null,
  "summary": string | null,        // short description of the work if given
  "projectHint": string | null,    // the project the user means. If it resembles a KNOWN PROJECT above (even misspelled, e.g. "city hall"→"City Mall", "the mall"→"City Mall"), return that project's EXACT name. Else their raw words, OR the number they picked. null if none.
  "confirm": boolean,              // true ONLY if they affirmed what we asked to confirm (yes/correct/sí/right)
  "rejectField": "work"|"hours"|"project"|"all"|null,  // if they rejected something, which part. "wrong project"→"project"; bare "no"→"all".
  "language": "en" | "es",         // language to reply in
  "isWorkRelated": boolean,        // false for greetings/spam/off-topic with no work content
  "consistencyIssue": string | null, // set ONLY if the IMAGE clearly contradicts the stated work type (e.g. photo is brickwork but they said electrical). Otherwise null. Give benefit of the doubt.
  "intent": "provide"|"correct"|"confirm"|"reject"|"select"|"question"|"chitchat"
}

RULES:
- If they are answering a confirmation and just say yes/no (or Y/N), set confirm/rejectField — do not re-extract the whole log.
- At the fix step, a lone field name ("work"/"hours"/"project") is a request to CHANGE that field: set rejectField to it. Do NOT treat the word "project" as a new project name.
- A correction ("actually it was 6 hours", "no, plumbing") sets the new slot value AND intent "correct".
- If they add info ("also used 3 bags of cement"), ADD it — set materials, keep intent "provide".
- Only set consistencyIssue for an OBVIOUS photo/text trade mismatch. When in doubt, null.`
}

// Instruct model for the focused yes/no/correction classification. It is far more reliable
// than the gpt-oss reasoning model at a bare "Y"/"N", and cheap.
const FOCUSED_MODEL = 'llama-3.1-8b-instant'

// State-conditioned interpretation. The interpreter's job depends on WHICH state we're in:
// - confirm/fix: infer yes / no / a specific correction (a small, focused decision).
// - everything else: full extraction of the work description (the one genuinely open case).
// Focusing the prompt to the current state is what makes a single "N" resolve reliably.
export async function interpretTurn(input: InterpretInput): Promise<TurnInterpretation> {
    if (input.lastAsked === 'confirm') return await interpretConfirm(input)
    if (input.lastAsked === 'fix') return await interpretFix(input)
    return await interpretExtraction(input)
}

// Confirm state ("Reply Y or N"): decide confirm / reject / correct. Small schema, instruct
// model → reliable on bare Y/N tokens.
async function interpretConfirm(input: InterpretInput): Promise<TurnInterpretation> {
    const raw = await withTimeout(
        groqJson(buildConfirmPrompt(input), { maxTokens: 300, model: FOCUSED_MODEL }),
        15000,
        null,
    )
    const language = raw?.language === 'es' ? 'es' : input.record.language

    // On failure, do NOTHING (never fabricate a confirm) — the engine simply re-asks.
    if (!raw || !raw.decision) return { language, isWorkRelated: true, intent: 'provide' }

    const field = (raw.field === 'work' || raw.field === 'hours' || raw.field === 'project') ? raw.field : null
    const hours = typeof raw.hours === 'number' ? raw.hours : (raw.hours ? Number(raw.hours) : null)
    const workType = raw.workType ?? null
    const projectHint = raw.projectHint != null ? String(raw.projectHint) : null

    if (raw.decision === 'confirm') {
        return { language, isWorkRelated: true, intent: 'confirm', confirm: true }
    }
    if (raw.decision === 'correct') {
        const gaveValue = !!workType || hours != null || !!projectHint
        return {
            language, isWorkRelated: true, intent: 'correct',
            workType, hours, projectHint,
            rejectField: !gaveValue && field ? field : null,   // named a field, no value → clear & re-ask
        }
    }
    if (raw.decision === 'reject') {
        return { language, isWorkRelated: true, intent: 'reject', confirm: false, rejectField: field ?? 'all' }
    }
    return { language, isWorkRelated: true, intent: 'provide' }
}

// Fix state ("what should I change?"): the deterministic field-name case is handled in the
// engine (detectFixFieldOnly). This runs only for VALUE replies ("6 hours", "it was plumbing",
// a project name), extracting the field + its new value. There is no "confirm" here.
async function interpretFix(input: InterpretInput): Promise<TurnInterpretation> {
    const raw = await withTimeout(
        groqJson(buildFixPrompt(input), { maxTokens: 200, model: FOCUSED_MODEL }),
        15000,
        null,
    )
    const language = raw?.language === 'es' ? 'es' : input.record.language
    if (!raw) return { language, isWorkRelated: true, intent: 'provide' }

    const field = (raw.field === 'work' || raw.field === 'hours' || raw.field === 'project') ? raw.field : null
    const hours = typeof raw.hours === 'number' ? raw.hours : (raw.hours ? Number(raw.hours) : null)
    const workType = raw.workType ?? null
    const projectHint = raw.projectHint != null ? String(raw.projectHint) : null

    // Always carry the named field as rejectField: applyPatch applies the value if one is
    // present, or clears the slot and re-asks if not.
    return { language, isWorkRelated: true, intent: 'correct', workType, hours, projectHint, rejectField: field }
}

// Open state: extract the full work description. Falls back to a conservative no-op on
// failure so the engine can still make progress (it will simply re-ask).
async function interpretExtraction(input: InterpretInput): Promise<TurnInterpretation> {
    const raw = await withTimeout(groqJson(buildPrompt(input), { maxTokens: 1500 }), 25000, null)

    if (!raw) {
        return {
            language: input.record.language,
            isWorkRelated: !!input.userText || !!input.transcript,
            intent: 'provide',
        }
    }

    return {
        workType: raw.workType ?? null,
        hours: typeof raw.hours === 'number' ? raw.hours : (raw.hours ? Number(raw.hours) : null),
        materials: Array.isArray(raw.materials) ? raw.materials : [],
        location: raw.location ?? null,
        summary: raw.summary ?? null,
        projectHint: raw.projectHint != null ? String(raw.projectHint) : null,
        confirm: raw.confirm === true,
        rejectField: raw.rejectField ?? null,
        language: raw.language === 'es' ? 'es' : 'en',
        isWorkRelated: raw.isWorkRelated !== false,
        consistencyIssue: raw.consistencyIssue ?? null,
        intent: raw.intent ?? 'provide',
    }
}

const WORK_TYPES = '"electrical","plumbing","hvac","carpentry","roofing","masonry","painting","rebar","concrete","drain","general"'

function logBlock(input: InterpretInput): string {
    const { record, projects } = input
    return `## CURRENT LOG
work: ${record.workType ?? '—'}
hours: ${record.hours ?? '—'}
project: ${record.projectName ?? '—'}
${projects.length ? `\n## KNOWN PROJECTS\n${projects.map(p => `- ${p.name}`).join('\n')}\n` : ''}`
}

function replyText(input: InterpretInput): string {
    return [input.userText, input.transcript].filter(Boolean).join(' ').trim() || '[no text]'
}

// Confirm state: yes / no / a specific correction.
function buildConfirmPrompt(input: InterpretInput): string {
    return `You interpret ONE reply in a construction work-logging flow. Output JSON only.

We showed the worker their logged work and asked them to CONFIRM it (we said "Reply Y or N").

${logBlock(input)}
## WORKER'S REPLY
${replyText(input)}

## DECIDE EXACTLY ONE
- "confirm" — they agree it is correct. Examples: Y, y, yes, yeah, yep, correct, right, ok, sí, correcto, 👍.
- "reject"  — they say it is wrong but do NOT say what to change. Examples: N, n, no, nope, nah, wrong.
- "correct" — they state a SPECIFIC change. Examples: "6 hours", "it was plumbing", "change the project", "wrong project", or a project name/number.

## OUTPUT (JSON only)
{
  "decision": "confirm" | "reject" | "correct",
  "field": "work" | "hours" | "project" | null,
  "workType": one of ${WORK_TYPES} | null,
  "hours": number | null,
  "projectHint": string | null,   // if they named a project, return the matching KNOWN PROJECT name; or the number they picked
  "language": "en" | "es"
}`
}

// Fix state: the worker is giving the NEW VALUE for a field. Identify the field + value.
function buildFixPrompt(input: InterpretInput): string {
    return `You interpret ONE reply in a construction work-logging flow. Output JSON only.

The worker said their log was wrong. We asked WHICH PART to change and what the new value is.

${logBlock(input)}
## WORKER'S REPLY
${replyText(input)}

## HOW TO INTERPRET
- "6 hours" / "make it 8" → field="hours", hours=that number.
- "it was plumbing" / "carpentry" → field="work", workType=that trade.
- a project name or a number picking one → field="project", projectHint=the matching KNOWN PROJECT name or the number.

## OUTPUT (JSON only)
{
  "field": "work" | "hours" | "project" | null,
  "workType": one of ${WORK_TYPES} | null,
  "hours": number | null,
  "projectHint": string | null,
  "language": "en" | "es"
}`
}
