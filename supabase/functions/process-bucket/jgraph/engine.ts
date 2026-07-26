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
    type Slot,
    type WorkRecord,
} from './record.ts'
import { interpretTurn } from './interpret.ts'
import { detectFixFieldOnly, fuzzyFindProject, parseHoursReply, resolveProjectReply, resolveProjectRef, type ProjectOption } from './match.ts'
import { composeReply, composeSuccess, composeUpdated } from './reply.ts'
import {
    analyzeImage,
    extractTradePhrase,
    getSupabase,
    sendMessage,
    stripThinking,
    transcribeAudio,
    translateToEnglish,
    withTimeout,
} from './io.ts'

const PROJECT_FRESH_HOURS = 6

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

    let companyCode = 'ACE'
    if (bucket.node_id) {
        const { data: node } = await supabase.from('nodes').select('code').eq('id', bucket.node_id).single()
        if (node?.code) companyCode = node.code
    }

    // --- Load the record (single source of truth) ---
    let record = loadRecord(bucket)

    // --- Honor member language preference ---
    const preferredLanguage = member?.language_preference === 'es' ? 'es' : (member?.language_preference === 'en' ? 'en' : null)
    if (preferredLanguage) {
        record.language = preferredLanguage
    }

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
    if (imageUrls.length > 0) {
        imageAnalysis = await withTimeout(analyzeImage(imageUrls[0]), 30000, '')
    }

    // --- This turn's input ONLY. Scoped to what arrived since we last processed this bucket
    //     (the watermark), so a prior voice note is never re-interpreted — mirrors how userText
    //     already isolated the latest text line. This is what kills phantom re-extraction. ---
    const textLines = (bucket.raw_text || '').split('\n').filter((l: string) => l.trim() !== '')
    const newTextLines = textLines.slice(record.seenTextLines)
    const newTranscripts = transcripts.slice(record.seenTranscripts)
    const userText = newTextLines.join('\n').trim()
    const transcript = newTranscripts.join(' ').trim()
    const reply = (userText || transcript).trim()

    // Mark this turn's input consumed so the next turn starts clean.
    record = { ...record, seenTextLines: textLines.length, seenTranscripts: transcripts.length }

    // --- Change Command Interceptor for Logged Tickets ---
    const isChangeCommand = (text: string) => {
        const s = text.toLowerCase().trim()
        return (
            s.startsWith('change ') ||
            s.startsWith('fix ') ||
            s.startsWith('modify ') ||
            s.startsWith('update ') ||
            s.includes('change project') ||
            s.includes('change hours') ||
            s.includes('change work')
        )
    }

    if (isChangeCommand(reply)) {
        let targetBucketId: number | null = null
        const ticketMatch = reply.match(/(?:#|TICKET\s*)?([A-Z]+)-(\d+)/i)
        if (ticketMatch && ticketMatch[2]) {
            const rawId = parseInt(ticketMatch[2], 10)
            targetBucketId = rawId > 10000 ? rawId - 10000 : rawId
        }

        if (!targetBucketId && bucket.member_id) {
            const { data: recentBuckets } = await supabase
                .from('buckets')
                .select('*')
                .eq('member_id', bucket.member_id)
                .neq('id', bucket.id)
                .not('status', 'in', '("cancelled","rejected")')
                .order('created_at', { ascending: false })
                .limit(1)

            if (recentBuckets && recentBuckets.length > 0) {
                targetBucketId = recentBuckets[0].id
            }
        }

        if (targetBucketId && targetBucketId !== bucket.id) {
            const { data: targetBucket } = await supabase.from('buckets').select('*').eq('id', targetBucketId).single()
            if (targetBucket && targetBucket.extracted_data) {
                let targetRec: WorkRecord = loadRecord(targetBucket)

                if (reply.toLowerCase().includes('project')) {
                    const pMatch = resolveProjectReply(reply, projects) || fuzzyFindProject(reply, projects)
                    if (pMatch) {
                        targetRec = { ...targetRec, projectId: pMatch.id, projectName: pMatch.name }
                        await supabase.from('buckets').update({
                            project_id: pMatch.id,
                            extracted_data: JSON.stringify(targetRec),
                        }).eq('id', targetBucketId)

                        const scopeLine = targetRec.summary || targetRec.workType || 'Work'
                        await supabase.from('txns').update({
                            project_id: pMatch.id,
                            job: `${scopeLine} - ${targetRec.hours || 0}h`,
                        }).eq('bucket_id', targetBucketId)

                        // Cancel the current edit-command bucket so it NEVER creates a duplicate ticket
                        await supabase.from('buckets').update({
                            status: 'cancelled',
                            conversation_state: 'cancelled'
                        }).eq('id', bucket.id)

                        const response = composeUpdated(targetRec, pMatch.name, { bucketId: targetBucketId, companyCode })
                        await sendMessage(bucket.from_phone, response, bucket.source)
                        return { status: 'cancelled', action: 'edit_applied', response }
                    }
                }

                if (reply.toLowerCase().includes('hours')) {
                    const h = parseHoursReply(reply)
                    if (h != null && h > 0 && h <= 168) {
                        targetRec = { ...targetRec, hours: h }
                        await supabase.from('buckets').update({
                            hours: h,
                            extracted_data: JSON.stringify(targetRec),
                        }).eq('id', targetBucketId)

                        const scopeLine = targetRec.summary || targetRec.workType || 'Work'
                        await supabase.from('txns').update({
                            time: h,
                            job: `${scopeLine} - ${h}h`,
                            labor: `${scopeLine} for ${h}h`,
                        }).eq('bucket_id', targetBucketId)

                        // Cancel the current edit-command bucket so it NEVER creates a duplicate ticket
                        await supabase.from('buckets').update({
                            status: 'cancelled',
                            conversation_state: 'cancelled'
                        }).eq('id', bucket.id)

                        const response = composeUpdated(targetRec, targetRec.projectName || 'Inbox', { bucketId: targetBucketId, companyCode })
                        await sendMessage(bucket.from_phone, response, bucket.source)
                        return { status: 'cancelled', action: 'edit_applied', response }
                    }
                }
            }
        }

        // ABSOLUTE SAFETY GUARD: A change command MUST NEVER fall through to create a new ticket!
        await supabase.from('buckets').update({
            status: 'cancelled',
            conversation_state: 'cancelled'
        }).eq('id', bucket.id)

        const errorResponse = `❓ Could not find ticket to update. To log new work, send a photo or describe your work.`
        await sendMessage(bucket.from_phone, errorResponse, bucket.source)
        return { status: 'cancelled', action: 'edit_cancelled', response: errorResponse }
    }

    // --- Expectation-driven resolution. When the app asked a CLOSED question, the reply IS the
    //     input to that question — resolve it deterministically (no LLM, no hallucination, no
    //     cost). Only genuinely open input falls through to the single interpreter call. ---
    const expected: Slot | null = record.lastAsked
    let projectRef: ProjectRef | null = null
    let resolved = false

    if (expected === 'project') {
        // We showed a numbered list: a number picks it, a name fuzzy-matches it.
        projectRef = resolveProjectReply(reply, projects)
        if (projectRef) {
            record = { ...record, projectId: projectRef.id, projectName: projectRef.name, projectRejected: false }
            resolved = true
        }
    } else if (expected === 'hours') {
        const h = parseHoursReply(reply)
        if (h != null) {
            record = { ...record, hours: h }
            resolved = true
        }
    } else if (expected === 'fix') {
        // "the work, the hours, or the project?" — if the reply just NAMES a field (no new
        // value), clear that slot and re-ask it. Deterministic, no LLM. Value replies
        // ("6 hours", "plumbing", a project name) fall through to interpretFix below.
        const field = detectFixFieldOnly(reply)
        if (field === 'project') {
            record = { ...record, projectId: null, projectName: null, projectRejected: true, needsFix: false }
            resolved = true
        } else if (field === 'hours') {
            record = { ...record, hours: null, needsFix: false }
            resolved = true
        } else if (field === 'work') {
            record = { ...record, workType: null, needsFix: false }
            resolved = true
        }
    }

    if (!resolved) {
        // Open-ended (describe work), or a closed reply we couldn't parse deterministically
        // ("the first one", "six and a half"), or a confirm/fix reply → the state-conditioned
        // interpreter. It already scopes its output to the current state, so no extra gating.
        const interp = await interpretTurn({ record, lastAsked: expected, userText, transcript, imageAnalysis, projects })
        projectRef = resolveProjectRef(interp, projects, expected)

        // Fuzzy-match the RAW reply against the project list ONLY when the user is actually
        // naming a project — i.e. the interpreter read this as a correction/selection. Never
        // on a confirm/reject: a bare "n" must not be scavenged into a project match (it
        // substring-hits any name containing "n"), which was silently cancelling rejections.
        const namingProject = interp.intent === 'correct' || interp.intent === 'select' || interp.intent === 'provide'
        if (!projectRef && namingProject && (expected === 'confirm' || expected === 'fix' || expected === 'project')) {
            const m = fuzzyFindProject(reply, projects)
            if (m) projectRef = { id: m.id, name: m.name }
        }
        record = applyPatch(record, interp, projectRef, preferredLanguage)
    }
    // --- ALWAYS Extract & Persist Grounded Work Summary ---
    const hasMediaInput = !!(
        imageAnalysis ||
        transcript ||
        (bucket.image_urls && bucket.image_urls.length > 0) ||
        (bucket.audio_urls && bucket.audio_urls.length > 0)
    )
    if (hasMediaInput) {
        record.isWorkRelated = true
    }

    const visualTrade = extractTradePhrase(imageAnalysis)
    const cleanAudio = stripThinking(transcript).replace(/<[^>]*>/g, '').trim()
    const cleanText = userText.trim()
    const bestDesc = visualTrade || cleanAudio || (cleanText.length > 2 ? cleanText : '')

    console.log(`[Engine] Summary Candidates -> imageAnalysis: "${imageAnalysis}" | visualTrade: "${visualTrade}" | cleanAudio: "${cleanAudio}" | cleanText: "${cleanText}"`)
    console.log(`[Engine] Selected bestDesc: "${bestDesc}" | Current record.summary: "${record.summary}"`)

    const isGenericSummary = !record.summary || ['work', 'general', 'site work', 'site photo work', 'your'].includes(record.summary.toLowerCase().trim()) || record.summary.includes('<')

    if (isGenericSummary && bestDesc) {
        console.log(`[Engine] Replacing generic record.summary ("${record.summary}") with bestDesc ("${bestDesc}")`)
        record.summary = bestDesc.substring(0, 100)
        record.workType = bestDesc.substring(0, 60)
    } else {
        console.log(`[Engine] Keeping existing record.summary: "${record.summary}"`)
    }

    // --- Media/Text Contradiction Guard (Run ONLY ONCE — DO NOT RE-FLAG ONCE CLARIFIED) ---
    if (record.lastAsked === 'clarify') {
        record.inconsistency = null // Clear contradiction on turn after asking ONCE — DO NOT HOLD THE USER!
    } else if ((imageAnalysis || transcript) && userText.trim().length > 2) {
        const mediaText = (imageAnalysis + ' ' + transcript).toLowerCase()
        const textLower = userText.toLowerCase()
        const isElectricalMedia = mediaText.includes('electrical') || mediaText.includes('breaker') || mediaText.includes('wire') || mediaText.includes('conduit') || mediaText.includes('panel')
        const isDiggingText = textLower.includes('dig') || textLower.includes('soil') || textLower.includes('excavat') || textLower.includes('earth')
        if (isElectricalMedia && isDiggingText) {
            record.inconsistency = "Photo/audio shows electrical panel/wiring, but text states digging/soil work."
        }
    }

    // --- Clock reset: whenever a project is selected/changed, reset member's 6-hr window to NOW ---
    if (projectRef && projectRef.id !== inbox?.id) {
        record.isFreshProject = true
        if (member?.id) {
            await supabase.from('members').update({
                last_confirmed_project_id: projectRef.id,
                project_confirmed_at: new Date().toISOString(),
            }).eq('id', member.id)
        }
    }

    // --- Decide next action ---
    let action = decideNextAction(record)

    // --- Project picker is snappy (1 QUESTION MAX): if already asked 'project' ONCE or if no active projects exist,
    //     fall back to Inbox immediately instead of looping ---
    if (action.type === 'SELECT_PROJECT' && inbox && (record.lastAsked === 'project' || nextAttempt(record, 'project') > MAX_ASK || !projects.length)) {
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
    const extras = { bucketId, companyCode, projects, imageAnalysis }
    if (action.type === 'SUBMIT') {
        return await submit(record, bucket, member, inbox, extras)
    }

    if (action.type === 'FLAG_FOR_REVIEW') {
        record.lastAsked = null
        record.askCount = 0
        const response = composeReply(action, record, extras)
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
    const response = composeReply(action, record, extras)

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

    return { ...record, projectId: match.id, projectName: match.name, isFreshProject: true }
}

// Terminal: write the transaction, mark the member's project, send the success message.
async function submit(
    record: WorkRecord,
    bucket: any,
    member: any,
    inbox: ProjectRef | null,
    extras: { bucketId: number; companyCode?: string; projects: ProjectOption[]; imageAnalysis: string },
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
    const scopeLine = englishSummary || record.scopeDescription || (record.workType ? `${record.workType}${record.location ? ` — ${record.location}` : ''}` : 'General Work')
    const txn = {
        bucket_id: bucketId,
        company_id: bucket.node_id,
        user_id: bucket.member_id,
        project_id: record.projectId,
        job: `${scopeLine} - ${finalHours || 0}h`,
        scope_description: scopeLine,
        labor: `${scopeLine} for ${finalHours || 0}h`,
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
    if (member?.id) {
        const updateData: any = {
            language_preference: record.language,
        }
        if (record.projectId && record.projectId !== inbox?.id) {
            updateData.last_confirmed_project_id = record.projectId
            updateData.project_confirmed_at = new Date().toISOString()
        }
        await supabase.from('members').update(updateData).eq('id', member.id)
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
