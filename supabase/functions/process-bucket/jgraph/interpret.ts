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
        case 'fix': return 'We asked WHAT THEY WANT TO CHANGE (work, hours, or project).'
        case 'confirm': return 'We asked them to CONFIRM the full log (work, hours, project). A bare "yes"/"correct"/"sí" means confirm; "no" means reject.'
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
- If they are answering a confirmation and just say yes/no, set confirm/rejectField — do not re-extract the whole log.
- A correction ("actually it was 6 hours", "no, plumbing") sets the new slot value AND intent "correct".
- If they add info ("also used 3 bags of cement"), ADD it — set materials, keep intent "provide".
- Only set consistencyIssue for an OBVIOUS photo/text trade mismatch. When in doubt, null.`
}

// The single interpret call. Falls back to a conservative no-op patch on failure so the
// engine can still make progress (it will simply re-ask).
export async function interpretTurn(input: InterpretInput): Promise<TurnInterpretation> {
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
