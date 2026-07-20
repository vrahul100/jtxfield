// engine.ts — Orchestrates one turn: load → interpret → apply → decide → act.
// The record (buckets.extracted_data) is the only authoritative state; conversation_state
// is written for observability only.

import {
    applyPatch,
    decideNextAction,
    enforceAttemptCap,
    loadRecord,
    MAX_ASK,
    nextAttempt,
    setInboxProject,
    slotOf,
    type ProjectRef,
    type WorkRecord,
} from './record.ts'
import { interpretTurn } from './interpret.ts'
import { fuzzyFindProject, resolveProjectRef, type ProjectOption } from './match.ts'
import { composeReply, composeSuccess } from './reply.ts'
import {
    analyzeImage,
    getSupabase,
    sendMessage,
    transcribeAudio,
    translateToEnglish,
    withTimeout,
} from './io.ts'

const PROJECT_FRESH_HOURS = 8

export async function runStateMachine(bucketId: number): Promise<{ status: string; action: string; response?: string | null }> {
    console.log(`[Engine] Starting bucket #${bucketId}`)
    const supabase = getSupabase()

    // --- Load bucket + member ---
    const { data: bucket, error } = await supabase.from('buckets').select('*').eq('id', bucketId).single()
    if (error || !bucket) {
        console.error('[Engine] Failed to load bucket:', error)
        return { status: 'error', action: 'error' }
    }

    let member: any = null
    if (bucket.member_id) {
        const { data } = await supabase.from('members').select('*').eq('id', bucket.member_id).single()
        member = data
    }

    // --- Load the record (single source of truth) ---
    let record = loadRecord(bucket)

    // --- Load active projects (needed for selection, resolution, and the fresh candidate) ---
    const { data: projectRows } = await supabase
        .from('projects')
        .select('id, name')
        .eq('node_id', bucket.node_id)
        .eq('is_active', true)
        .eq('is_inbox', false)
        .order('name')
        .limit(10)
    const projects: ProjectOption[] = projectRows || []

    // --- Inbox is the fallback destination when no project can be inferred ---
    const { data: inboxRow } = await supabase
        .from('projects')
        .select('id, name')
        .eq('node_id', bucket.node_id)
        .eq('is_inbox', true)
        .limit(1)
        .single()
    const inbox: ProjectRef | null = inboxRow ? { id: inboxRow.id, name: inboxRow.name } : null

    // --- Prefill a project candidate from the member's recent confirmed project ---
    record = prefillProject(record, member, projects)

    // --- Media preprocessing (only when we still need info — keeps cost down) ---
    const audioUrls: string[] = bucket.audio_urls ? JSON.parse(bucket.audio_urls) : []
    const imageUrls: string[] = bucket.image_urls ? JSON.parse(bucket.image_urls) : []
    let transcripts: string[] = bucket.transcripts ? JSON.parse(bucket.transcripts) : []

    if (audioUrls.length > transcripts.length) {
        for (let i = transcripts.length; i < audioUrls.length; i++) {
            const t = await withTimeout(transcribeAudio(audioUrls[i]), 15000, null)
            if (t) transcripts.push(t)
        }
        await supabase.from('buckets').update({ transcripts: JSON.stringify(transcripts) }).eq('id', bucketId)
    }

    let imageAnalysis = ''
    if (imageUrls.length > 0 && !record.workType) {
        imageAnalysis = await withTimeout(analyzeImage(imageUrls[0]), 15000, '')
    }

    // --- Latest user input (text line + newest transcript) ---
    const textLines = (bucket.raw_text || '').split('\n').filter((l: string) => l.trim() !== '')
    const userText = textLines.length ? textLines[textLines.length - 1] : ''
    const transcript = transcripts.length ? transcripts[transcripts.length - 1] : ''

    // --- THE single LLM call: interpret this turn ---
    const interp = await interpretTurn({
        record,
        lastAsked: record.lastAsked,
        userText,
        transcript,
        imageAnalysis,
        projects,
    })

    // --- Confirmation intent (yes/no/correct/reject) comes from the LLM interpreter itself
    //     (interp.confirm / interp.rejectField) — no keyword matching. Audio is already folded
    //     in because the transcript is passed to interpretTurn above. This adds NO LLM cost:
    //     interpretTurn is the one call we already make each turn. ---
    const latestRaw = transcript || userText || ''

    // --- Resolve project: LLM hint first, then fuzzy-match the raw text against the real
    //     project list (dynamic data, not hardcoded) on project-relevant turns. ---
    let projectRef: ProjectRef | null = resolveProjectRef(interp, projects, record.lastAsked)
    if (!projectRef && (record.lastAsked === 'confirm' || record.lastAsked === 'fix' || record.lastAsked === 'project')) {
        const m = fuzzyFindProject(latestRaw, projects)
        if (m) projectRef = { id: m.id, name: m.name }
    }
    record = applyPatch(record, interp, projectRef)

    // --- No project inferred and the user hasn't asked to pick one → default to Inbox ---
    if (!record.projectId && !record.projectRejected && inbox) {
        record = setInboxProject(record, inbox)
    }

    // --- Decide next action ---
    let action = decideNextAction(record)

    // --- Project picker is best-effort: after MAX_ASK tries, fall back to Inbox instead
    //     of looping or flagging ---
    if (action.type === 'SELECT_PROJECT' && inbox && nextAttempt(record, 'project') > MAX_ASK) {
        record = setInboxProject(record, inbox)
        action = decideNextAction(record)
    }

    // --- Cap runaway asks on required slots (work/hours → flag, never fabricate) ---
    const capped = enforceAttemptCap(action, record)
    action = capped.action

    console.log(`[Engine] action=${action.type} record=`, {
        work: record.workType, hours: record.hours, project: record.projectName,
        confirmed: record.confirmed, lastAsked: record.lastAsked, askCount: record.askCount,
    })

    // --- Act ---
    if (action.type === 'SUBMIT') {
        return await submit(record, bucket, member, inbox, { bucketId, projects, imageAnalysis })
    }

    if (action.type === 'FLAG_FOR_REVIEW') {
        record.lastAsked = null
        record.askCount = 0
        const response = composeReply(action, record, { bucketId, projects, imageAnalysis })
        await sendMessage(bucket.from_phone, response, bucket.source)
        await supabase.from('buckets').update({
            extracted_data: JSON.stringify(record),
            conversation_state: action.type,
            state_attempts: 0,
            ai_response: response,
            status: 'pending_review',
        }).eq('id', bucketId)
        console.log(`[Engine] Flagged bucket #${bucketId}: ${action.reason}`)
        return { status: 'pending_review', action: 'flagged', response }
    }

    // --- Non-terminal: ask the next question and wait ---
    record.lastAsked = slotOf(action)
    record.askCount = capped.askCount
    const response = composeReply(action, record, { bucketId, projects, imageAnalysis })

    await sendMessage(bucket.from_phone, response, bucket.source)
    await supabase.from('buckets').update({
        extracted_data: JSON.stringify(record),
        conversation_state: action.type,
        state_attempts: record.askCount,
        project_id: record.projectId,
        ai_response: response,
        status: 'open',
    }).eq('id', bucketId)

    return { status: 'open', action: 'waiting', response }
}

// Reuse a project the member confirmed recently (<8h) as the current candidate, so repeat
// loggers just get one "confirm?" instead of a full project picker.
function prefillProject(record: WorkRecord, member: any, projects: ProjectOption[]): WorkRecord {
    if (record.projectId || record.projectRejected) return record
    if (!member?.last_confirmed_project_id || !member?.project_confirmed_at) return record

    const ageHours = (Date.now() - new Date(member.project_confirmed_at).getTime()) / (1000 * 60 * 60)
    if (ageHours > PROJECT_FRESH_HOURS) return record

    const match = projects.find(p => p.id === member.last_confirmed_project_id)
    if (!match) return record

    return { ...record, projectId: match.id, projectName: match.name }
}

// Terminal: write the transaction, mark the member's project, send the success message.
async function submit(
    record: WorkRecord,
    bucket: any,
    member: any,
    inbox: ProjectRef | null,
    extras: { bucketId: number; projects: ProjectOption[]; imageAnalysis: string },
): Promise<{ status: string; action: string; response: string }> {
    const supabase = getSupabase()
    const { bucketId } = extras

    // Project name for the receipt.
    let projectName = 'Inbox'
    if (record.projectId) {
        const { data: proj } = await supabase.from('projects').select('name').eq('id', record.projectId).single()
        projectName = proj?.name || record.projectName || 'Inbox'
    }

    // Store summaries in English (users may log in Spanish).
    let englishSummary = record.summary
    if (record.summary && record.language === 'es') {
        englishSummary = await translateToEnglish(record.summary)
    }

    // Persist editable fields on the bucket, then insert the txn.
    await supabase.from('buckets').update({
        summary: englishSummary,
        hours: record.hours,
        project_id: record.projectId,
    }).eq('id', bucketId)

    const finalHours = record.hours ?? null
    const txn = {
        bucket_id: bucketId,
        company_id: bucket.node_id,
        user_id: bucket.member_id,
        project_id: record.projectId,
        job: `${record.workType || 'work'} - ${finalHours || 0}h`,
        scope_description: englishSummary || record.workType,
        labor: englishSummary || `${record.workType || 'work'} for ${finalHours || 0}h`,
        material: record.materials.length ? record.materials.join(', ') : null,
        location: record.location || null,
        time: finalHours,
        potential_change: bucket.potential_change || false,
        status: 'COMPLETED',
    }
    const { error: txnError } = await supabase.from('txns').insert(txn)
    if (txnError) console.error('[Engine] txn insert error:', txnError)

    // Remember the project for this member's next log — but NOT when it went to Inbox
    // (Inbox is "unassigned", so it shouldn't seed the recent-project inference).
    if (record.projectId && member?.id && record.projectId !== inbox?.id) {
        await supabase.from('members').update({
            last_confirmed_project_id: record.projectId,
            project_confirmed_at: new Date().toISOString(),
        }).eq('id', member.id)
    }

    // Mark the conversation done.
    record.lastAsked = null
    record.askCount = 0
    const response = composeSuccess(record, projectName, extras)
    await sendMessage(bucket.from_phone, response, bucket.source)
    await supabase.from('buckets').update({
        extracted_data: JSON.stringify(record),
        conversation_state: 'complete',
        state_attempts: 0,
        ai_response: response,
        status: 'submitted',
    }).eq('id', bucketId)

    console.log(`[Engine] Submitted bucket #${bucketId}`)
    return { status: 'submitted', action: 'success', response }
}
