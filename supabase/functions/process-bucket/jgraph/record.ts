// record.ts — Pure slot-filling core. NO I/O here so it stays unit-testable.
// The WorkRecord is the single source of truth; conversation_state is derived, not stored.

// ============================================================================
// TYPES
// ============================================================================

// What we last asked the user — lets us interpret bare replies ("yes", "3", "no").
export type Slot = 'greet' | 'work' | 'hours' | 'project' | 'clarify' | 'fix' | 'confirm'

// The persisted record. Lives in buckets.extracted_data.
export interface WorkRecord {
    // Slots
    workType: string | null
    hours: number | null
    projectId: number | null
    projectName: string | null
    materials: string[]
    location: string | null
    summary: string | null
    scopeDescription: string | null

    // Meta
    language: 'en' | 'es'
    isWorkRelated: boolean
    inconsistency: string | null   // image/text mismatch awaiting clarification
    confidence: 'high' | 'medium' | 'low'

    // Confirmation lifecycle
    confirmed: boolean             // user gave the final yes on the full record
    isFreshProject?: boolean       // project was populated within the 6-hr active window
    projectRejected: boolean       // user rejected the candidate project → force selection
    needsFix: boolean              // user rejected confirmation without saying what → ask

    // Bookkeeping for interpreting the next turn + attempt caps
    lastAsked: Slot | null
    askCount: number               // consecutive times we've asked the SAME thing

    // Input watermark: how many of the bucket's accumulated text lines / transcripts we've
    // already interpreted. The next turn reads ONLY what arrived after this, so a prior voice
    // note is never re-interpreted (that was the phantom re-extraction bug).
    seenTextLines: number
    seenTranscripts: number
}

// One turn's interpretation, produced by the single LLM call. Only fields the message
// actually addresses are set; everything else is left unchanged in the record.
export interface TurnInterpretation {
    workType?: string | null
    hours?: number | null
    materials?: string[]
    location?: string | null
    summary?: string | null
    scopeDescription?: string | null
    projectHint?: string | null   // free-text project name OR a number the user picked
    confirm?: boolean
    rejectField?: 'hours' | 'project' | 'all' | null
    language: 'en' | 'es'
    isWorkRelated: boolean
    consistencyIssue?: string | null
    confidence?: 'high' | 'medium' | 'low' | null
    intent: 'provide' | 'correct' | 'confirm' | 'reject' | 'select' | 'question' | 'chitchat'
}

// A project reference resolved from projectHint/selection to a real row.
export interface ProjectRef {
    id: number
    name: string
}

// The decision — what to do next. Derived purely from the record.
export type Action =
    | { type: 'GREET' }
    | { type: 'ASK_HOURS' }
    | { type: 'CLARIFY_INCONSISTENCY'; reason: string }
    | { type: 'SELECT_PROJECT' }
    | { type: 'ASK_FIX' }
    | { type: 'CONFIRM' }
    | { type: 'SUBMIT' }
    | { type: 'FLAG_FOR_REVIEW'; reason: string }

// ============================================================================
// FACTORY + LOADING
// ============================================================================

export function createRecord(): WorkRecord {
    return {
        workType: null,
        hours: null,
        projectId: null,
        projectName: null,
        materials: [],
        location: null,
        summary: null,
        scopeDescription: null,
        language: 'en',
        isWorkRelated: true,
        inconsistency: null,
        confidence: 'medium',
        confirmed: false,
        isFreshProject: false,
        projectRejected: false,
        needsFix: false,
        lastAsked: null,
        askCount: 0,
        seenTextLines: 0,
        seenTranscripts: 0,
    }
}

// Parse the record out of a bucket. Understands both the new record shape and the
// legacy ExtractionResult shape (so in-flight conversations don't hard-reset on deploy).
export function loadRecord(bucket: any): WorkRecord {
    const base = createRecord()
    // NOTE: we deliberately do NOT seed projectId from bucket.project_id. New buckets are
    // created with project_id = the Inbox (see webhook createBucket), which is a DB default
    // meaning "unassigned" — not a real user choice. The chosen project round-trips through
    // the record itself (extracted_data), so turn 2+ keeps it; turn 1 stays null so the
    // engine shows the project picker instead of confirming a phantom project.

    if (!bucket?.extracted_data) return base

    let parsed: any
    try {
        parsed = typeof bucket.extracted_data === 'string'
            ? JSON.parse(bucket.extracted_data)
            : bucket.extracted_data
    } catch {
        return base
    }
    if (!parsed || typeof parsed !== 'object') return base
    const raw = bucket.extracted_data
        ? (typeof bucket.extracted_data === 'string' ? JSON.parse(bucket.extracted_data) : bucket.extracted_data)
        : {}

    return {
        workType: raw.workType ?? null,
        hours: raw.hours ?? null,
        projectId: raw.projectId ?? bucket.project_id ?? null,
        projectName: raw.projectName ?? null,
        materials: Array.isArray(raw.materials) ? raw.materials : [],
        location: raw.location ?? null,
        summary: raw.summary ?? null,
        scopeDescription: raw.scopeDescription ?? null,
        language: raw.language === 'es' ? 'es' : 'en',
        isWorkRelated: raw.isWorkRelated !== false,
        inconsistency: raw.inconsistency ?? null,
        confidence: raw.confidence || 'medium',
        confirmed: raw.confirmed === true,
        isFreshProject: raw.isFreshProject === true,
        projectRejected: raw.projectRejected === true,
        needsFix: raw.needsFix === true,
        lastAsked: raw.lastAsked ?? null,
        askCount: raw.askCount ?? 0,
        seenTextLines: raw.seenTextLines ?? 0,
        seenTranscripts: raw.seenTranscripts ?? 0,
    }
}

export function slotOfAction(action: Action): Slot | null {
    switch (action.type) {
        case 'GREET': return 'greet'
        case 'ASK_WORK': return 'work'
        case 'ASK_HOURS': return 'hours'
        case 'SELECT_PROJECT': return 'project'
        case 'CLARIFY_INCONSISTENCY': return 'clarify'
        case 'ASK_FIX': return 'fix'
        case 'CONFIRM': return 'confirm'
        default: return null
    }
}

// ============================================================================
// REDUCER — apply one turn's interpretation to the record
// ============================================================================

export function isEmpty(rec: WorkRecord): boolean {
    return !rec.workType && !rec.hours && rec.materials.length === 0 &&
        !rec.location && !rec.summary && !rec.projectId
}

// Pure. Produces the next record. Corrections REPLACE a slot; materials ADD; a changed
// slot un-confirms the record; rejections (interpreted against what we last asked) clear
// the relevant slot. Never fabricates values.
export function applyPatch(rec: WorkRecord, p: TurnInterpretation, projectRef: ProjectRef | null, preferredLanguage?: 'en' | 'es' | null): WorkRecord {
    const next: WorkRecord = { ...rec, materials: [...rec.materials], needsFix: false }

    next.language = preferredLanguage || p.language || rec.language

    // --- Work type ---
    if (p.workType != null && p.workType !== '') {
        if (rec.confirmed && rec.workType && p.workType !== rec.workType) next.confirmed = false
        next.workType = p.workType
    }

    // --- Hours ---
    if (p.hours != null && p.hours > 0) {
        if (rec.confirmed && rec.hours && p.hours !== rec.hours) next.confirmed = false
        next.hours = p.hours
    }

    // --- Materials (additive, de-duped) ---
    if (p.materials?.length) {
        for (const m of p.materials) {
            if (m && !next.materials.some(x => x.toLowerCase() === m.toLowerCase())) next.materials.push(m)
        }
    }

    // --- Location / summary / scopeDescription ---
    if (p.location) next.location = p.location
    if (p.summary) next.summary = p.summary
    if (p.scopeDescription) next.scopeDescription = p.scopeDescription
    if (p.confidence) next.confidence = p.confidence

    // --- Project (resolved reference wins) ---
    if (projectRef) {
        if (rec.confirmed && rec.projectId && projectRef.id !== rec.projectId) next.confirmed = false
        next.projectId = projectRef.id
        next.projectName = projectRef.name
        next.projectRejected = false
    }

    // --- Work-related flag: this message has work content, OR we already had some
    // (sticky), OR the interpreter judged it work-related. NOT sticky on the optimistic
    // default, so a first-turn greeting correctly reads as non-work. ---
    const anySlot = !!(next.workType || next.hours || next.materials.length || next.location || next.summary)
    next.isWorkRelated = anySlot || p.isWorkRelated || !isEmpty(rec)

    // --- Consistency (Clarify ONLY ONCE) ---
    if (p.consistencyIssue && rec.lastAsked !== 'clarify') {
        next.inconsistency = p.consistencyIssue
    } else if (rec.inconsistency && rec.lastAsked === 'clarify') {
        next.inconsistency = null   // User responded to the single clarification prompt
    }

    // --- Confirmation / rejection, interpreted against what we last asked. Handled at BOTH
    //     the confirm step ("Reply Y or N") and the fix step ("what should I change?").
    //     Naming a field at the fix step MUST clear that slot so the engine re-asks it —
    //     otherwise the answer has nowhere to land and we loop straight back to CONFIRM. ---
    if (rec.lastAsked === 'confirm' || rec.lastAsked === 'fix') {
        if (p.confirm) {
            next.confirmed = true
        } else if (p.rejectField === 'project' && !projectRef) {
            next.projectId = null
            next.projectName = null
            next.projectRejected = true
        } else if (p.rejectField === 'hours' && p.hours == null) {
            next.hours = null
        } else if (p.rejectField === 'work' && p.workType == null) {
            next.workType = null
        } else if (rec.lastAsked === 'confirm' && (p.rejectField === 'all' || p.intent === 'reject')
            && !projectRef && p.hours == null && !p.workType) {
            next.needsFix = true   // rejected at confirm but didn't say what → ask which field
        }
    }

    return next
}

// ============================================================================
// POLICY — decide the next action purely from the record
// Fast & Cost-Optimized: Auto-defaults hours to 8 and proceeds directly to SUBMIT
// without multi-turn chatty interrogation loops.
// ============================================================================

export function decideNextAction(rec: WorkRecord): Action {
    if (!rec.isWorkRelated && isEmpty(rec)) return { type: 'GREET' }

    // Auto-default hours if missing or invalid (no chatty ASK_HOURS loops)
    if (!rec.hours || rec.hours <= 0) {
        rec.hours = 8
    }

    // If project is explicitly rejected or missing, pick from options or Inbox
    if (!rec.projectId || rec.projectRejected) {
        return { type: 'SELECT_PROJECT' }
    }

    if (rec.needsFix) return { type: 'ASK_FIX' }

    // Proceed directly to SUBMIT (zero chat loops, zero confirmation prompts)
    return { type: 'SUBMIT' }
}

// Attach the Inbox project as the resolved fallback destination.
export function setInboxProject(rec: WorkRecord, inbox: ProjectRef): WorkRecord {
    return { ...rec, projectId: inbox.id, projectName: inbox.name, projectRejected: false }
}

// Next attempt number for a slot, given what we last asked.
export function nextAttempt(rec: WorkRecord, slot: Slot): number {
    return slot === rec.lastAsked ? rec.askCount + 1 : 1
}

// Which slot an action is asking about (for attempt-cap bookkeeping). null = not an ask.
export function slotOf(action: Action): Slot | null {
    switch (action.type) {
        case 'GREET': return 'greet'
        case 'ASK_WORK': return 'work'
        case 'ASK_HOURS': return 'hours'
        case 'SELECT_PROJECT': return 'project'
        case 'CLARIFY_INCONSISTENCY': return 'clarify'
        case 'ASK_FIX': return 'fix'
        case 'CONFIRM': return 'confirm'
        default: return null
    }
}

const REQUIRED_SLOTS = new Set<Slot>([])
export const MAX_ASK = 3

// Given the chosen action and the record's prior ask history, return updated askCount without blocking.
export function enforceAttemptCap(action: Action, rec: WorkRecord): { action: Action; askCount: number } {
    const slot = slotOf(action)
    if (!slot) return { action, askCount: 0 }

    const attempt = nextAttempt(rec, slot)
    return { action, askCount: attempt }
}
