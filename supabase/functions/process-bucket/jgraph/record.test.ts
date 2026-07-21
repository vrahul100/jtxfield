import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
    applyPatch,
    createRecord,
    decideNextAction,
    enforceAttemptCap,
    loadRecord,
    setInboxProject,
    type TurnInterpretation,
    type WorkRecord,
} from './record.ts'

// Minimal interpretation with sane defaults.
function interp(p: Partial<TurnInterpretation>): TurnInterpretation {
    return { language: 'en', isWorkRelated: true, intent: 'provide', ...p }
}

// --- Baseline: fresh message with everything → straight to CONFIRM (project prefilled) ---
Deno.test('full first message goes to CONFIRM', () => {
    let r = createRecord()
    r.projectId = 5; r.projectName = 'City Mall'   // simulate fresh prefill
    r = applyPatch(r, interp({ workType: 'electrical', hours: 6 }), null)
    assertEquals(decideNextAction(r).type, 'CONFIRM')
})

// --- THE brittle case #1: correction during confirmation ---
Deno.test('correcting hours during CONFIRM re-confirms with new value', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 4, projectId: 5, projectName: 'City Mall', confirmed: false, lastAsked: 'confirm' }
    // user: "wait, make it 6 hours not 4"
    r = applyPatch(r, interp({ hours: 6, intent: 'correct' }), null)
    assertEquals(r.hours, 6)
    assertEquals(r.confirmed, false)          // correction un-confirms
    assertEquals(decideNextAction(r).type, 'CONFIRM')   // re-ask, not "unclear"
})

// --- THE brittle case #2: over-answering in an early slot ---
Deno.test('answering hours + work + project all at once from ASK_HOURS', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: null, lastAsked: 'hours' }
    // user: "actually it was plumbing, 4 hours, on the Elm St job"
    r = applyPatch(r, interp({ workType: 'plumbing', hours: 4, intent: 'correct' }), { id: 9, name: 'Elm St' })
    assertEquals(r.workType, 'plumbing')       // work-type change is NOT lost
    assertEquals(r.hours, 4)
    assertEquals(r.projectId, 9)               // project captured even though we asked hours
    assertEquals(decideNextAction(r).type, 'CONFIRM')
})

// --- THE brittle case #3: "3" means project selection, not 3 hours ---
Deno.test('bare number is a project pick when we asked for project', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 6, lastAsked: 'project' }
    // resolveProjectRef would map "3" → projects[2]; here we pass the resolved ref
    r = applyPatch(r, interp({ projectHint: '3', intent: 'select' }), { id: 12, name: 'Warehouse' })
    assertEquals(r.hours, 6)                    // hours untouched
    assertEquals(r.projectId, 12)
})

// --- Rejecting the project at CONFIRM routes to selection, not a dead end ---
Deno.test('rejecting project at CONFIRM forces SELECT_PROJECT', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 6, projectId: 5, projectName: 'City Mall', lastAsked: 'confirm' }
    r = applyPatch(r, interp({ rejectField: 'project', intent: 'reject' }), null)
    assertEquals(r.projectId, null)
    assertEquals(r.projectRejected, true)
    assertEquals(decideNextAction(r).type, 'SELECT_PROJECT')
})

// --- Regression (the screenshot loop): N → ASK_FIX → "project" → SELECT_PROJECT, not CONFIRM ---
Deno.test('N then naming a field at the fix step routes to that field, not back to CONFIRM', () => {
    // 1. At CONFIRM the user rejects with a bare "n" (no field named).
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 5, projectId: 5, projectName: 'High-Rise Tower A', lastAsked: 'confirm' }
    r = applyPatch(r, interp({ confirm: false, rejectField: 'all', intent: 'reject' }), null)
    assertEquals(r.needsFix, true)
    assertEquals(decideNextAction(r).type, 'ASK_FIX')

    // 2. Engine asked "what should I change?" → lastAsked becomes 'fix'. User says "project".
    r.lastAsked = 'fix'
    r = applyPatch(r, interp({ rejectField: 'project', intent: 'correct' }), null)
    assertEquals(r.projectId, null)               // the project slot got cleared
    assertEquals(r.projectRejected, true)
    assertEquals(decideNextAction(r).type, 'SELECT_PROJECT')   // NOT back to CONFIRM
})

// --- Fix step: naming "hours" clears hours so we re-ask them ---
Deno.test('naming hours at the fix step re-asks hours', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 5, projectId: 5, projectName: 'City Mall', lastAsked: 'fix' }
    r = applyPatch(r, interp({ rejectField: 'hours', intent: 'correct' }), null)
    assertEquals(r.hours, null)
    assertEquals(decideNextAction(r).type, 'ASK_HOURS')
})

// --- Fix step: giving the new value directly applies it and re-confirms ---
Deno.test('giving a new value at the fix step applies it', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 5, projectId: 5, projectName: 'City Mall', lastAsked: 'fix' }
    // user answers the "what to change?" question with "6 hours" directly
    r = applyPatch(r, interp({ hours: 6, intent: 'correct' }), null)
    assertEquals(r.hours, 6)
    assertEquals(decideNextAction(r).type, 'CONFIRM')
})

// --- Confirm yes → SUBMIT ---
Deno.test('yes at CONFIRM submits', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 6, projectId: 5, projectName: 'City Mall', lastAsked: 'confirm' }
    r = applyPatch(r, interp({ confirm: true, intent: 'confirm' }), null)
    assertEquals(decideNextAction(r).type, 'SUBMIT')
})

// --- Off-topic greeting → GREET, never fabricates ---
Deno.test('greeting stays in GREET', () => {
    let r = applyPatch(createRecord(), interp({ isWorkRelated: false, intent: 'chitchat' }), null)
    assertEquals(decideNextAction(r).type, 'GREET')
})

// --- Attempt cap: 4th failed hours ask flags instead of fabricating ---
Deno.test('repeated failed hours ask flags for review', () => {
    const r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: null, lastAsked: 'hours', askCount: 3 }
    const action = decideNextAction(r)
    assertEquals(action.type, 'ASK_HOURS')
    const capped = enforceAttemptCap(action, r)
    assertEquals(capped.action.type, 'FLAG_FOR_REVIEW')   // not a fabricated 2h default
})

// --- Materials add, don't replace ---
Deno.test('adding materials later is additive', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'masonry', hours: 5, materials: ['bricks'] }
    r = applyPatch(r, interp({ materials: ['cement'], intent: 'provide' }), null)
    assertEquals(r.materials, ['bricks', 'cement'])
})

// --- Legacy extracted_data shape loads without reset ---
Deno.test('legacy ExtractionResult shape maps into a record', () => {
    const bucket = {
        project_id: 7,
        conversation_state: 'confirming_project',
        state_attempts: 1,
        extracted_data: JSON.stringify({
            workType: 'roofing', hoursWorked: 8, materials: ['shingles'],
            responseLanguage: 'es', isConsistent: true, isWorkRelated: true,
        }),
    }
    const r = loadRecord(bucket)
    assertEquals(r.workType, 'roofing')
    assertEquals(r.hours, 8)
    assertEquals(r.language, 'es')
    assertEquals(r.projectId, null)   // inbox-default project_id is NOT trusted as a choice
    assertEquals(r.lastAsked, 'confirm')
})

// --- Regression: fresh bucket seeded with Inbox project must NOT be treated as a choice ---
Deno.test('inbox-seeded bucket does not count as a chosen project', () => {
    const bucket = {
        project_id: 5,   // the Inbox project id, set by webhook createBucket
        conversation_state: null,
        extracted_data: JSON.stringify({ workType: 'electrical', hoursWorked: 5, isWorkRelated: true }),
    }
    const r = loadRecord(bucket)
    assertEquals(r.projectId, null)   // inbox default is "unassigned", not a real choice
})

// --- Project is non-blocking: no inference → Inbox fallback → CONFIRM (never forces a picker) ---
Deno.test('uninferred project falls back to Inbox and confirms', () => {
    let r: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 5 }
    // no projectId, user hasn't rejected anything → engine attaches Inbox
    r = setInboxProject(r, { id: 5, name: 'Inbox' })
    assertEquals(r.projectId, 5)
    assertEquals(decideNextAction(r).type, 'CONFIRM')
})

// --- The picker only appears after an EXPLICIT project rejection ---
Deno.test('picker shown only when the attributed project was rejected', () => {
    const notRejected: WorkRecord = { ...createRecord(), workType: 'electrical', hours: 5, projectId: null }
    assertEquals(decideNextAction(notRejected).type, 'CONFIRM')   // no picker without a rejection

    const rejected: WorkRecord = { ...notRejected, projectRejected: true }
    assertEquals(decideNextAction(rejected).type, 'SELECT_PROJECT')
})
