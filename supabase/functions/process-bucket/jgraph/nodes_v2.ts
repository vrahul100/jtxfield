// nodes_v2.ts - Clean State Handlers
// FOCUS: State transitions and conversation flow ONLY
// No media transcription, no complex extraction - just solid state machine

import { createClient } from '@supabase/supabase-js'

// ============================================================================
// TYPES
// ============================================================================

interface StateContext {
    bucketId: number
    bucket: any
    member: any
    extraction: {
        workType: string | null
        hoursWorked: number | null
        summary: string | null
    }
}

interface StateResult {
    nextState: string | null  // null = stay in current state (waiting for response)
    response: string | null
    extraction?: any
    projectId?: number | null
}

// ============================================================================
// HELPERS
// ============================================================================

const DEV_MODE = Deno.env.get('DEV_MODE') === 'true'

function getSupabase() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    return createClient(supabaseUrl, supabaseKey)
}

// Get the LAST message from accumulated raw_text
function getLastMessage(rawText: string): string {
    if (!rawText) return ''
    const lines = rawText.split('\n').filter(line => line.trim() !== '')
    return (lines[lines.length - 1] || '').toLowerCase().trim()
}

// Add dev mode state info to response
function withDevInfo(response: string, state: string, extraction: any, attempts: number, lastMsg?: string): string {
    if (!DEV_MODE) return response
    const ext = `workType:${extraction.workType || '-'} hours${extraction.hoursWorked || '-'}`
    const msgPart = lastMsg ? ` lastMsg:"${lastMsg.substring(0, 20)}"` : ''
    return `${response}\n\n_[DEV: state=${state}, ${ext}, attempts=${attempts}${msgPart}]_`
}

// Send WhatsApp message
async function sendMessage(phone: string, message: string, source: string) {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const fromNumber = Deno.env.get('TWILIO_FROM_WHATSAPP')!  // Use correct env var name

    console.log(`[Send] To ${phone}: ${message}`)

    const params = new URLSearchParams({
        To: `whatsapp:${phone}`,
        From: `whatsapp:${fromNumber}`,
        Body: message,
    })

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    })
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function runStateMachine(bucketId: number): Promise<{ status: string; action: string }> {
    console.log(`[StateMachine] Starting for bucket #${bucketId}`)

    const supabase = getSupabase()

    // Load bucket
    const { data: bucket, error } = await supabase
        .from('buckets')
        .select('*')
        .eq('id', bucketId)
        .single()

    if (error || !bucket) {
        console.error('[StateMachine] Failed to load bucket:', error)
        return { status: 'error', action: 'error' }
    }

    // Load member explicitly (join was not reliable)
    let member = null
    if (bucket.member_id) {
        const { data: memberData } = await supabase
            .from('members')
            .select('*')
            .eq('id', bucket.member_id)
            .single()
        member = memberData
        console.log(`[StateMachine] Loaded member #${bucket.member_id}:`, member ? `last_confirmed_project_id=${member.last_confirmed_project_id}` : 'NULL')
    }

    // Load extraction from bucket
    let extraction = { workType: null, hoursWorked: null, summary: null }
    if (bucket.extraction_json) {
        try {
            extraction = typeof bucket.extraction_json === 'string'
                ? JSON.parse(bucket.extraction_json)
                : bucket.extraction_json
        } catch (e) {
            console.log('[StateMachine] Failed to parse extraction_json')
        }
    }

    const ctx: StateContext = {
        bucketId,
        bucket,
        member,  // Use explicitly loaded member
        extraction,
    }

    // Get current state
    const currentState = bucket.conversation_state || 'initial'
    console.log(`[StateMachine] Current state: ${currentState}`)

    // Route to state handler
    let result: StateResult

    switch (currentState) {
        case 'initial':
            result = await handleInitial(ctx)
            break
        case 'collecting_work':
            result = await handleCollectingWork(ctx)
            break
        case 'asking_more':
            result = await handleAskingMore(ctx)
            break
        case 'confirming_project':
            result = await handleConfirmingProject(ctx)
            break
        case 'selecting_project':
            result = await handleSelectingProject(ctx)
            break
        case 'complete':
            result = await handleComplete(ctx)
            break
        default:
            console.log(`[StateMachine] Unknown state: ${currentState}`)
            result = await handleInitial(ctx)
    }

    console.log(`[StateMachine] Result: nextState=${result.nextState}, response=${result.response?.substring(0, 30)}...`)

    // Handle transition
    if (result.nextState && result.nextState !== currentState) {
        console.log(`[StateMachine] Transitioning: ${currentState} → ${result.nextState}`)

        // If transitioning, run the next state immediately (no message sent yet)
        if (!result.response) {
            const transitionUpdate: any = {
                conversation_state: result.nextState,
                extraction_json: result.extraction ? JSON.stringify(result.extraction) : bucket.extraction_json,
            }

            // CRITICAL: Include project_id if set (e.g., from confirming_project → complete)
            if (result.projectId !== undefined) {
                transitionUpdate.project_id = result.projectId
            }

            await supabase.from('buckets').update(transitionUpdate).eq('id', bucketId)

            // Recursively handle next state
            return runStateMachine(bucketId)
        }
    }

    // Save state and send response if any
    const updates: any = {
        extraction_json: result.extraction ? JSON.stringify(result.extraction) : bucket.extraction_json,
    }

    if (result.nextState) {
        updates.conversation_state = result.nextState
    }

    if (result.response) {
        updates.ai_response = result.response
        updates.status = result.nextState === 'complete' ? 'submitted' : 'open'

        // Send the message
        await sendMessage(bucket.from_phone, result.response, bucket.source)
    }

    if (result.projectId !== undefined) {
        updates.project_id = result.projectId
    }

    await supabase.from('buckets').update(updates).eq('id', bucketId)

    return {
        status: result.nextState === 'complete' ? 'submitted' : 'open',
        action: result.nextState === 'complete' ? 'success' : 'waiting',
    }
}

// ============================================================================
// STATE HANDLERS
// ============================================================================

// INITIAL: First message - check what we have and route
async function handleInitial(ctx: StateContext): Promise<StateResult> {
    console.log('[State: Initial]')

    const { bucket, extraction } = ctx

    // For now, mock extraction from raw_text (will add real extraction later)
    const rawText = bucket.raw_text || ''

    // Simple mock: look for patterns like "X hours" or "Xh"
    let workType = extraction.workType
    let hoursWorked = extraction.hoursWorked
    let summary = extraction.summary

    if (!workType && rawText) {
        // Try to extract from raw text (simple patterns)
        const hoursMatch = rawText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i)
        if (hoursMatch) {
            hoursWorked = parseFloat(hoursMatch[1])
        }

        // For now, use raw text as work type if we have hours
        if (hoursWorked && hoursWorked > 0) {
            workType = rawText.replace(/\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)\b/gi, '').trim() || 'work'
            summary = rawText
        }
    }

    const newExtraction = { workType, hoursWorked, summary }

    // Check if we have work info
    const hasWorkInfo = workType && hoursWorked && hoursWorked > 0

    if (hasWorkInfo) {
        // Go to asking_more
        return {
            nextState: 'asking_more',
            response: null,
            extraction: newExtraction,
        }
    } else {
        // Need to collect work info
        return {
            nextState: 'collecting_work',
            response: null,
            extraction: newExtraction,
        }
    }
}

// COLLECTING_WORK: Ask for work type and hours
async function handleCollectingWork(ctx: StateContext): Promise<StateResult> {
    console.log('[State: CollectingWork]')

    const { bucket, extraction } = ctx
    const stateAttempts = bucket.state_attempts || 0
    const lastMsg = getLastMessage(bucket.raw_text || '')

    // If this is a response (attempts > 0), try to extract
    if (stateAttempts > 0 && lastMsg) {
        // Simple extraction from response
        const hoursMatch = lastMsg.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)?/i)
        const hours = hoursMatch ? parseFloat(hoursMatch[1]) : extraction.hoursWorked
        const workType = lastMsg.replace(/\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)?/gi, '').trim() || extraction.workType || 'work'

        if (hours && hours > 0) {
            return {
                nextState: 'asking_more',
                response: null,
                extraction: { workType, hoursWorked: hours, summary: lastMsg },
            }
        }
    }

    // Max attempts reached - use defaults
    if (stateAttempts >= 2) {
        return {
            nextState: 'asking_more',
            response: null,
            extraction: { workType: 'work', hoursWorked: 2, summary: bucket.raw_text },
        }
    }

    // Ask for info
    const supabase = getSupabase()
    await supabase.from('buckets').update({ state_attempts: stateAttempts + 1 }).eq('id', ctx.bucketId)

    return {
        nextState: 'collecting_work',
        response: withDevInfo("What kind of work, and how many hours?", 'collecting_work', extraction, stateAttempts + 1),
        extraction,
    }
}

// ASKING_MORE: "Anything else to add?"
async function handleAskingMore(ctx: StateContext): Promise<StateResult> {
    console.log('[State: AskingMore]')

    const { bucket, extraction } = ctx
    const stateAttempts = bucket.state_attempts || 0
    const lastMsg = getLastMessage(bucket.raw_text || '')

    console.log(`[State: AskingMore] stateAttempts=${stateAttempts}, lastMsg="${lastMsg}"`)

    // If this is a response (attempts > 0)
    if (stateAttempts > 0) {
        const firstWord = lastMsg.split(/[\s.,!]/)[0]

        // Check for NO - user is done adding
        const noWords = ['no', 'n', 'nope', 'nah', 'done', 'nothing', 'thats', "that's", 'nada']
        const saidNo = noWords.includes(firstWord) || noWords.some(w => lastMsg === w)

        console.log(`[State: AskingMore] firstWord="${firstWord}", saidNo=${saidNo}`)

        if (saidNo) {
            // User is done - go to project
            const supabase = getSupabase()
            await supabase.from('buckets').update({ state_attempts: 0 }).eq('id', ctx.bucketId)

            return {
                nextState: 'confirming_project',
                response: null,
                extraction,
            }
        } else {
            // User added more - append and ask again
            const newWorkType = extraction.workType || 'work'
            const newHours = extraction.hoursWorked || 0

            const supabase = getSupabase()
            await supabase.from('buckets').update({ state_attempts: stateAttempts + 1 }).eq('id', ctx.bucketId)

            return {
                nextState: 'asking_more',
                response: withDevInfo(`${newWorkType} for ${newHours}h. Anything else to add?`, 'asking_more', extraction, stateAttempts + 1, lastMsg),
                extraction,
            }
        }
    }

    // First time - ask "Anything else?"
    const wt = extraction.workType || 'work'
    const h = extraction.hoursWorked || 0

    const supabase = getSupabase()
    await supabase.from('buckets').update({ state_attempts: 1 }).eq('id', ctx.bucketId)

    return {
        nextState: 'asking_more',
        response: withDevInfo(`${wt} for ${h}h. Anything else to add?`, 'asking_more', extraction, 1, lastMsg),
        extraction,
    }
}

// CONFIRMING_PROJECT: "At X project? (Y/N)"
async function handleConfirmingProject(ctx: StateContext): Promise<StateResult> {
    console.log('[State: ConfirmingProject]')

    const { bucket, member, extraction } = ctx
    const stateAttempts = bucket.state_attempts || 0
    const lastMsg = getLastMessage(bucket.raw_text || '')
    const supabase = getSupabase()

    // Get member's last confirmed project (always, for Y/N response handling)
    let memberProjectId: number | null = member?.last_confirmed_project_id || null
    let memberProjectName = ''

    if (memberProjectId) {
        const { data: proj } = await supabase.from('projects').select('name').eq('id', memberProjectId).single()
        memberProjectName = proj?.name || 'your project'
    } 
    
    console.log(`[ConfirmingProject] memberProjectName="${memberProjectName}"`)

    // Check if confirmation is "fresh" (within 8 hours) - only affects whether we ASK
    let projectIsFresh = false
    if (member?.last_confirmed_project_id && member?.project_confirmed_at) {
        const confirmedAt = new Date(member.project_confirmed_at)
        const hoursDiff = (Date.now() - confirmedAt.getTime()) / (1000 * 60 * 60)
        projectIsFresh = hoursDiff <= 8
    }

    // If this is a response (we already asked)
    if (stateAttempts > 0) {
        const firstWord = lastMsg.split(/[\s.,!]/)[0].toLowerCase()

        const yesWords = ['yes', 'y', 'si', 'sí', 'yeah', 'yep', 's', 'ok', 'sure']
        const noWords = ['no', 'n', 'nope', 'nah']
        const saidYes = yesWords.includes(firstWord) || yesWords.some(w => lastMsg === w)
        const saidNo = noWords.includes(firstWord) || noWords.some(w => lastMsg === w)

        console.log(`[ConfirmingProject] lastMsg="${lastMsg}", firstWord="${firstWord}", saidYes=${saidYes}, saidNo=${saidNo}, memberProjectId=${memberProjectId}`)

        // If they said YES and we have a project ID (we already asked about it!)
        if (saidYes && memberProjectId) {
            // Confirmed - update and complete
            await supabase.from('buckets').update({ state_attempts: 0 }).eq('id', ctx.bucketId)
            await supabase.from('members').update({
                last_confirmed_project_id: memberProjectId,
                project_confirmed_at: new Date().toISOString(),
            }).eq('id', member.id)

            return {
                nextState: 'complete',
                response: null,
                extraction,
                projectId: memberProjectId,
            }
        } else if (saidNo || stateAttempts >= 2) {
            // Show project list
            await supabase.from('buckets').update({ state_attempts: 0 }).eq('id', ctx.bucketId)
            return {
                nextState: 'selecting_project',
                response: null,
                extraction,
            }
        }
    }

    // No project or not fresh - go straight to selecting
    if (!memberProjectId || !projectIsFresh) {
        return {
            nextState: 'selecting_project',
            response: null,
            extraction,
        }
    }

    // First time - ask for confirmation
    const wt = extraction.workType || 'work'
    const h = extraction.hoursWorked || 0

    await supabase.from('buckets').update({ state_attempts: 1 }).eq('id', ctx.bucketId)

    return {
        nextState: 'confirming_project',
        response: withDevInfo(`${wt} for ${h}h. At ${memberProjectName}? (Y/N)`, 'confirming_project', extraction, 1),
        extraction,
    }
}

// SELECTING_PROJECT: Show numbered list
async function handleSelectingProject(ctx: StateContext): Promise<StateResult> {
    console.log('[State: SelectingProject]')

    const { bucket, member, extraction } = ctx
    const stateAttempts = bucket.state_attempts || 0
    const lastMsg = getLastMessage(bucket.raw_text || '')
    const supabase = getSupabase()

    // Get project list
    const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('node_id', bucket.node_id)
        .eq('is_active', true)
        .eq('is_inbox', false)
        .order('name')
        .limit(10)

    // If this is a response
    if (stateAttempts > 0) {
        const match = lastMsg.match(/^(\d+)/)

        if (match && projects) {
            const selectedIndex = parseInt(match[1], 10) - 1

            if (selectedIndex >= 0 && selectedIndex < projects.length) {
                const selectedProject = projects[selectedIndex]

                await supabase.from('buckets').update({ state_attempts: 0 }).eq('id', ctx.bucketId)
                await supabase.from('members').update({
                    last_confirmed_project_id: selectedProject.id,
                    project_confirmed_at: new Date().toISOString(),
                }).eq('id', member.id)

                return {
                    nextState: 'complete',
                    response: null,
                    extraction,
                    projectId: selectedProject.id,
                }
            }
        }

        // Max attempts - default to Inbox
        if (stateAttempts >= 2) {
            const { data: inbox } = await supabase
                .from('projects')
                .select('id')
                .eq('node_id', bucket.node_id)
                .eq('is_inbox', true)
                .single()

            await supabase.from('buckets').update({ state_attempts: 0 }).eq('id', ctx.bucketId)

            return {
                nextState: 'complete',
                response: null,
                extraction,
                projectId: inbox?.id || null,
            }
        }
    }

    // Show list
    const wt = extraction.workType || 'work'
    const h = extraction.hoursWorked || 0
    const projectList = projects?.map((p, i) => `${i + 1}. ${p.name}`).join('\n') || 'No projects'

    await supabase.from('buckets').update({ state_attempts: stateAttempts + 1 }).eq('id', ctx.bucketId)

    return {
        nextState: 'selecting_project',
        response: withDevInfo(`${wt} for ${h}h.\n\n${projectList}\n\nWhich one?`, 'selecting_project', extraction, stateAttempts + 1),
        extraction,
    }
}

// COMPLETE: Create transaction and send confirmation
async function handleComplete(ctx: StateContext): Promise<StateResult> {
    console.log('[State: Complete]')

    const { bucket, extraction } = ctx
    const supabase = getSupabase()

    // Get project name
    let projectName = 'Inbox'
    if (bucket.project_id) {
        const { data: proj } = await supabase.from('projects').select('name').eq('id', bucket.project_id).single()
        projectName = proj?.name || 'Inbox'
    }

    // Create transaction (using correct schema columns)
    const txn = {
        bucket_id: ctx.bucketId,
        company_id: bucket.node_id,
        user_id: bucket.member_id,
        project_id: bucket.project_id,
        job: `${extraction.workType || 'work'} - ${extraction.hoursWorked || 0}h`,
        scope_description: extraction.summary || extraction.workType,
        status: 'COMPLETED',
    }

    const { error } = await supabase.from('txns').insert(txn)
    if (error) console.error('[State: Complete] Error creating txn:', error)

    const wt = extraction.workType || 'work'
    const h = extraction.hoursWorked || 0
    const confirmMsg = withDevInfo(`✅ ${wt} for ${h}h at ${projectName}.\n"${extraction.summary || wt}"`, 'complete', extraction, 0)

    return {
        nextState: 'complete',
        response: confirmMsg,
        extraction,
    }
}
