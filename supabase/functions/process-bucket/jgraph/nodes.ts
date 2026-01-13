// Jentyx Node Implementations for Adaptive Brain
// Each node is a pure function that takes state and returns partial state updates

import { createClient } from '@supabase/supabase-js'
import type { BrainState, ExtractionResult, ValidationResult } from './state.ts'
import type { Bucket, Member } from './types.ts'

// Required fields for validation
const REQUIRED_FIELDS = ['workType', 'hoursWorked', 'summary']

// Field questions for missing data
const FIELD_QUESTIONS: Record<string, string> = {
    workType: '🔧 What type of work did you do? (electrical, plumbing, carpentry, etc.)',
    hoursWorked: '⏱️ How many hours did you work?',
    summary: '📝 Can you briefly describe what you did?',
}

// ============================================================================
// NODE: Load Context
// ============================================================================

export async function loadContextNode(state: BrainState): Promise<Partial<BrainState>> {
    console.log(`[Node: LoadContext] Loading bucket #${state.bucketId}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: bucket, error } = await supabase
        .from('buckets')
        .select('*, members(*)')
        .eq('id', state.bucketId)
        .single()

    if (error || !bucket) {
        console.error(`[Node: LoadContext] Error:`, error)
        return {
            status: 'pending_review',
            action: 'error',
            response: 'Sorry, I had trouble finding your ticket.'
        }
    }

    // Parse JSON fields
    const imageUrls: string[] = bucket.image_urls ? JSON.parse(bucket.image_urls) : []
    const audioUrls: string[] = bucket.audio_urls ? JSON.parse(bucket.audio_urls) : []
    const transcripts: string[] = bucket.transcripts ? JSON.parse(bucket.transcripts) : []

    // Load previous extraction if exists (for multi-turn conversations)
    let previousExtraction: ExtractionResult | null = null
    if (bucket.extraction_json) {
        try {
            previousExtraction = JSON.parse(bucket.extraction_json) as ExtractionResult
            console.log(`[Node: LoadContext] Loaded previous extraction: workType=${previousExtraction.workType}, hours=${previousExtraction.hoursWorked}`)
        } catch (e) {
            console.log(`[Node: LoadContext] Failed to parse previous extraction`)
        }
    }

    console.log(`[Node: LoadContext] Loaded: ${imageUrls.length} images, ${audioUrls.length} audio`)

    // Infer projectConfirmed from bucket.project_id
    // If project_id is set and NOT the Inbox, the project was already confirmed
    let projectConfirmed = false
    if (bucket.project_id) {
        // Check if this project is the Inbox (we need to query for it)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { data: inboxProject } = await supabase
            .from('projects')
            .select('id')
            .eq('node_id', bucket.node_id)
            .eq('is_inbox', true)
            .single()

        if (inboxProject && bucket.project_id !== inboxProject.id) {
            projectConfirmed = true
            console.log(`[Node: LoadContext] Project ${bucket.project_id} is confirmed (not Inbox ${inboxProject.id})`)
        } else {
            console.log(`[Node: LoadContext] Project ${bucket.project_id} is Inbox, not confirmed yet`)
        }
    }

    return {
        bucket: bucket as Bucket,
        member: bucket.members as Member,
        rawText: bucket.raw_text || '',
        imageUrls,
        audioUrls,
        transcripts,
        attempts: bucket.validation_attempts || 0,
        extraction: previousExtraction,  // Start with previous extraction
        projectConfirmed,  // Persist across turns
    }
}

// ============================================================================
// NODE: Preprocess Media
// ============================================================================

export async function preprocessMediaNode(state: BrainState): Promise<Partial<BrainState>> {
    console.log(`[Node: PreprocessMedia] Processing media`)

    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) {
        console.log(`[Node: PreprocessMedia] No GROQ_API_KEY, skipping`)
        return {}
    }

    const updates: Partial<BrainState> = {}

    // Transcribe audio if not already done
    if (state.audioUrls.length > 0 && state.transcripts.length === 0) {
        console.log(`[Node: PreprocessMedia] Transcribing ${state.audioUrls.length} audio files`)
        const newTranscripts: string[] = []

        for (const url of state.audioUrls) {
            const transcript = await transcribeAudio(url, groqApiKey)
            if (transcript) {
                newTranscripts.push(transcript)
                console.log(`[Node: PreprocessMedia] Transcript: "${transcript.slice(0, 50)}..."`)
            }
        }

        updates.transcripts = newTranscripts
    }

    // Analyze images
    if (state.imageUrls.length > 0) {
        console.log(`[Node: PreprocessMedia] Analyzing ${state.imageUrls.length} images`)
        const analysis = await analyzeImage(state.imageUrls[0], groqApiKey)
        updates.imageAnalysis = analysis
        console.log(`[Node: PreprocessMedia] Analysis: "${analysis.slice(0, 100)}..."`)
    }

    return updates
}

// ============================================================================
// NODE: Extract Data
// ============================================================================

export async function extractDataNode(state: BrainState): Promise<Partial<BrainState>> {
    console.log(`[Node: ExtractData] Extracting from conversation`)

    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) {
        return {
            status: 'pending_review',
            action: 'error',
            response: 'Unable to process - AI unavailable'
        }
    }

    // Build transcript from all text sources
    const allText = [
        state.rawText,
        ...state.transcripts.map(t => `[Voice]: ${t}`)
    ].filter(Boolean).join('\n')

    // Pass last bot message as context
    const lastBotMessage = state.bucket?.ai_response
    const prompt = buildExtractionPrompt(allText, state.imageAnalysis, lastBotMessage || undefined)

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            }),
        })

        if (!response.ok) {
            const err = await response.text()
            console.error(`[Node: ExtractData] API Error: ${err}`)

            // Parse error to detect rate limit
            let errorMessage = '⚠️ Sorry, I had trouble processing your message. Please try again in a few minutes.'
            let isRateLimit = false
            try {
                const errorJson = JSON.parse(err)
                if (errorJson.error?.code === 'rate_limit_exceeded') {
                    isRateLimit = true
                    errorMessage = '⚠️ System is temporarily busy. Your work has been saved - please try again in a few minutes, or I\'ll process it automatically when ready.'
                }
            } catch (e) { /* Not JSON, use default message */ }

            // Notify user about the error
            if (state.bucket?.from_phone && state.bucket?.source) {
                await sendWhatsAppMessage(state.bucket.from_phone, errorMessage, state.bucket.source)
            }

            // Mark bucket as needing retry (not as permanent error)
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const supabase = createClient(supabaseUrl, supabaseKey)

            await supabase.from('buckets').update({
                status: isRateLimit ? 'open' : 'pending_review',  // Rate limit = retry, other errors = review
                ai_response: errorMessage,
                validation_attempts: (state.attempts || 0) + 1
            }).eq('id', state.bucketId)

            return { status: isRateLimit ? 'open' : 'pending_review', action: 'error', response: errorMessage }
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content
        const newExtraction = JSON.parse(content) as ExtractionResult

        // Merge with previous extraction - KEEP previous values if new ones are null
        const previousExtraction = state.extraction
        const mergedExtraction: ExtractionResult = {
            workType: newExtraction.workType || previousExtraction?.workType || null,
            hoursWorked: newExtraction.hoursWorked ?? previousExtraction?.hoursWorked ?? null,
            summary: newExtraction.summary || previousExtraction?.summary || '',
            materials: newExtraction.materials?.length > 0 ? newExtraction.materials : (previousExtraction?.materials || []),
            location: newExtraction.location || previousExtraction?.location || null,
            projectHint: newExtraction.projectHint || previousExtraction?.projectHint || null,
            isConsistent: newExtraction.isConsistent ?? previousExtraction?.isConsistent ?? true,
            inconsistencyReason: newExtraction.inconsistencyReason || previousExtraction?.inconsistencyReason || null,
            responseLanguage: newExtraction.responseLanguage || previousExtraction?.responseLanguage || 'en',
            isWorkRelated: newExtraction.isWorkRelated ?? previousExtraction?.isWorkRelated ?? true,  // Default to true, don't reject too much
        }

        console.log(`[Node: ExtractData] Merged extraction:`, {
            workType: mergedExtraction.workType,
            hours: mergedExtraction.hoursWorked,
            projectHint: mergedExtraction.projectHint,
            consistent: mergedExtraction.isConsistent,
            isWorkRelated: mergedExtraction.isWorkRelated,
        })

        return { extraction: mergedExtraction }
    } catch (e) {
        console.error(`[Node: ExtractData] Error:`, e)
        return { status: 'pending_review', action: 'error' }
    }
}

// ============================================================================
// NODE: Resolve Project
// ============================================================================

export async function resolveProjectNode(state: BrainState): Promise<Partial<BrainState>> {
    console.log(`[Node: ResolveProject] checking if project needs resolution. projectConfirmed=${state.projectConfirmed}`)

    // Skip if project was already explicitly confirmed by user in this conversation
    // NOTE: We check projectConfirmed, NOT bucket.project_id, because bucket defaults to Inbox
    if (state.projectConfirmed) {
        console.log(`[Node: ResolveProject] Project already confirmed, skipping`)
        return {}
    }

    const extraction = state.extraction
    if (!extraction) return {}

    // Check for raw text "n" or "no" if hint is missing
    let hint = extraction.projectHint ? String(extraction.projectHint).trim() : null

    // Fallback: If no hint, check raw text for "n" / "no" OR a number
    // This catches cases where LLM fails to extract "NO" or "1" from simple short replies
    if (!hint && state.rawText) {
        // raw_text may be a full conversation: "original\n---\nQ: which project?\nA: 1"
        // Extract only the LAST answer (after the last "A: ")
        let raw = state.rawText
        if (raw.includes('\nA:')) {
            const parts = raw.split('\nA:')
            raw = parts[parts.length - 1].trim()
        } else {
            raw = raw.trim()
        }
        raw = raw.toLowerCase()
        console.log(`[Node: ResolveProject] Extracted last answer: "${raw}"`)

        if (['n', 'no', 'nope', 'nah'].includes(raw)) {
            console.log(`[Node: ResolveProject] No LLM hint, but raw text is "${raw}" - treating as NO`)
            hint = 'NO'
        } else if (/^(\d+)[\.)]?$/.test(raw)) {
            const match = raw.match(/^(\d+)/)
            const num = match ? match[1] : raw
            console.log(`[Node: ResolveProject] No LLM hint, but raw text is number "${raw}" -> "${num}" - using as hint`)
            hint = num
        }
    }

    if (!hint) {
        console.log(`[Node: ResolveProject] No projectHint in extraction, skipping`)
        return {}
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    let resolvedProjectId: number | null = null

    const lastMsg = (state.bucket?.ai_response || '').toLowerCase()

    // Check if last message was asking about project confirmation or selection
    // e.g. "Still at City Mall?", "Which project?", "Sigues en...", "En qué proyecto..."
    const isConfirmationQuestion =
        lastMsg.includes('still at') ||
        lastMsg.includes('sigues en') ||
        lastMsg.includes('confirm')

    const hasHours = state.extraction?.hoursWorked !== undefined && state.extraction?.hoursWorked !== null

    const isSelectionQuestion =
        lastMsg.includes('which project') ||
        lastMsg.includes('qué proyecto') ||
        lastMsg.includes('choose') ||
        /\d+\.\s/.test(lastMsg) || // Contains a numbered list "1. "
        (hasHours && !state.projectConfirmed) // Heuristic: If we have hours but no project, a number is likely a project selection

    // CASE A: User confirmed "YES" to "Still working on X?"
    // We check if member has a last_confirmed_project_id
    if (['confirmed', 'yes', 'si', 'confirmado', 'sí', 'yeah', 'yep', 'yup', 'y'].includes(hint.toLowerCase())) {
        if (state.member?.last_confirmed_project_id && isConfirmationQuestion) {
            console.log(`[Node: ResolveProject] User confirmed previous project ID: ${state.member.last_confirmed_project_id}`)
            resolvedProjectId = state.member.last_confirmed_project_id
        } else {
            console.log(`[Node: ResolveProject] User said YES/CONFIRM, but not in response to confirmation question. Ignoring.`)
        }
    }
    // CASE A.5: User said "NO" to "Still working on X?" - need to show project list
    else if (['no', 'nope', 'nah', 'not', 'n'].includes(hint.toLowerCase())) {
        if (isConfirmationQuestion) {
            console.log(`[Node: ResolveProject] User rejected project confirmation (Hint: ${hint}) - will show project list`)
            // Clear the hint so validateNode will add 'projectId' to missingFields on next round
            // Also clear member's last_confirmed so we ask for full selection
            await supabase.from('members').update({
                last_confirmed_project_id: null,
                project_confirmed_at: null
            }).eq('id', state.member!.id)

            const updatedMember = { ...state.member!, last_confirmed_project_id: null, project_confirmed_at: null } as Member
            console.log(`[Node: ResolveProject] Returning updated member state (last_confirmed=null)`)

            // Return updated state - projectConfirmed stays false, validate will ask for projectId
            return {
                extraction: { ...extraction, projectHint: null },
                member: updatedMember
            }
        } else {
            console.log(`[Node: ResolveProject] User said NO/N, but not in response to confirmation question. Ignoring.`)
        }
    }
    // CASE B: User replied with a number (from the project list we sent)
    // Relaxed regex allows "1", "1.", "1)"
    else if (/^(\d+)[\.)]?$/.test(hint) && isSelectionQuestion) {
        const selection = parseInt(hint, 10)
        console.log(`[Node: ResolveProject] User selected project #${selection}`)

        // Fetch the same project list we sent (same query order, excluding Inbox)
        const { data: projects } = await supabase
            .from('projects')
            .select('id, name')
            .eq('node_id', state.bucket!.node_id)
            .eq('is_active', true)
            .eq('is_inbox', false)  // Exclude Inbox project
            .order('name')
            .limit(10)

        console.log(`[Node: ResolveProject] Available projects:`, projects?.map(p => `${p.id}:${p.name}`).join(', '))

        if (projects && selection >= 1 && selection <= projects.length) {
            resolvedProjectId = projects[selection - 1].id
            console.log(`[Node: ResolveProject] Selected index ${selection - 1}: ${projects[selection - 1].name} (id: ${resolvedProjectId})`)
        } else {
            console.log(`[Node: ResolveProject] Invalid selection ${selection}, max was ${projects?.length}`)
        }
    }
    // CASE C: User named a project explicitly
    else {
        // Search for project by name or alias
        console.log(`[Node: ResolveProject] Searching for project matching: "${hint}"`)

        // 1. Try exact match on name
        const { data: exactMatch } = await supabase
            .from('projects')
            .select('id')
            .eq('node_id', state.bucket!.node_id)
            .ilike('name', hint)
            .single()

        if (exactMatch) {
            resolvedProjectId = exactMatch.id
        } else {
            // 2. Try fuzzy / alias match (simple ilike on name for now, can expand to aliases JSON later)
            const { data: fuzzyMatch } = await supabase
                .from('projects')
                .select('id')
                .eq('node_id', state.bucket!.node_id)
                .ilike('name', `%${hint}%`)
                .limit(1)

            if (fuzzyMatch && fuzzyMatch.length > 0) {
                resolvedProjectId = fuzzyMatch[0].id
            }
        }
    }

    if (resolvedProjectId) {
        console.log(`[Node: ResolveProject] Resolved to Project ID: ${resolvedProjectId}`)

        // Update Bucket
        const { error: bucketError } = await supabase.from('buckets').update({
            project_id: resolvedProjectId,
            intent: 'log_work' // Assume it's work logging if they gave a project
        }).eq('id', state.bucketId)

        if (bucketError) {
            console.error(`[Node: ResolveProject] Bucket update error:`, bucketError)
        } else {
            console.log(`[Node: ResolveProject] Bucket updated with project_id: ${resolvedProjectId}`)
        }

        // Update Member (cache this project as last confirmed)
        const { error: memberError } = await supabase.from('members').update({
            last_confirmed_project_id: resolvedProjectId,
            project_confirmed_at: new Date().toISOString()
        }).eq('id', state.member!.id)

        if (memberError) {
            console.error(`[Node: ResolveProject] Member update error:`, memberError)
        } else {
            console.log(`[Node: ResolveProject] Member updated with last_confirmed_project_id: ${resolvedProjectId}`)
        }

        // Update Local State - include projectConfirmed flag
        const updatedBucket = { ...state.bucket!, project_id: resolvedProjectId } as Bucket
        console.log(`[Node: ResolveProject] Returning updated bucket with project_id: ${updatedBucket.project_id}`)

        return {
            bucket: updatedBucket,
            member: {
                ...state.member!,
                last_confirmed_project_id: resolvedProjectId,
                project_confirmed_at: new Date().toISOString()
            } as Member,
            projectConfirmed: true
        }
    }

    console.log(`[Node: ResolveProject] Could not resolve project hint: "${hint}"`)
    return {}
}

// ============================================================================
// NODE: Validate
// ============================================================================

export function validateNode(state: BrainState): Partial<BrainState> {
    console.log(`[Node: Validate] Validating extraction`)

    const extraction = state.extraction
    if (!extraction) {
        return {
            validation: {
                isValid: false,
                missingFields: REQUIRED_FIELDS,
                invalidFields: [],
                inconsistencyReason: null,
            }
        }
    }

    // Check consistency (but ignore in several cases - trust the worker)
    // Skip if: system error, user already clarified, OR multiple images (different work aspects)
    const isSystemError = extraction.inconsistencyReason?.toLowerCase().includes('could not be loaded') ||
        extraction.inconsistencyReason?.toLowerCase().includes('image analysis') ||
        extraction.inconsistencyReason?.toLowerCase().includes('unavailable') ||
        extraction.inconsistencyReason?.toLowerCase().includes('failed')

    const userAlreadyClarified = state.attempts > 0
    const hasMultipleImages = state.imageUrls.length >= 2

    if (!extraction.isConsistent && extraction.inconsistencyReason && !isSystemError && !userAlreadyClarified && !hasMultipleImages) {
        console.log(`[Node: Validate] Inconsistency: ${extraction.inconsistencyReason}`)
        return {
            validation: {
                isValid: false,
                missingFields: [],
                invalidFields: [],
                inconsistencyReason: extraction.inconsistencyReason,
            }
        }
    } else if (hasMultipleImages && !extraction.isConsistent) {
        console.log(`[Node: Validate] Multiple images (${state.imageUrls.length}) - skipping consistency check, trusting user`)
    } else if (userAlreadyClarified && !extraction.isConsistent) {
        console.log(`[Node: Validate] User already clarified (attempts=${state.attempts}) - trusting their answer, ignoring inconsistency`)
    } else if (isSystemError) {
        console.log(`[Node: Validate] Ignoring system error in consistency check: ${extraction.inconsistencyReason}`)
    }

    // Check required fields
    const missingFields: string[] = []
    for (const field of REQUIRED_FIELDS) {
        const value = extraction[field as keyof ExtractionResult]
        const isEmpty = value === undefined || value === null || value === '' ||
            (field === 'hoursWorked' && (typeof value !== 'number' || value <= 0))
        if (isEmpty) {
            missingFields.push(field)
        }
    }

    // Check data validity
    const invalidFields: string[] = []
    if (typeof extraction.hoursWorked === 'number' && extraction.hoursWorked > 24) {
        invalidFields.push('hoursWorked')
    }

    // Check project - use projectConfirmed flag (NOT bucket.project_id which may be pre-set)
    // If projectConfirmed is false and no projectHint was extracted, we need to ask
    const member = state.member
    const hasProjectConfirmed = state.projectConfirmed === true
    const hasProjectHint = extraction.projectHint != null && extraction.projectHint !== ''

    if (!hasProjectConfirmed && !hasProjectHint) {
        // Check if member has a recent confirmed project (within 2 hours)
        let needsProjectConfirmation = false
        let needsProjectSelection = true

        if (member?.last_confirmed_project_id && member?.project_confirmed_at) {
            const confirmedAt = new Date(member.project_confirmed_at)
            const now = new Date()
            const hoursDiff = (now.getTime() - confirmedAt.getTime()) / (1000 * 60 * 60)

            if (hoursDiff <= 2) {
                // Within 2 hours - ask for confirmation, not selection
                needsProjectConfirmation = true
                needsProjectSelection = false
                console.log(`[Node: Validate] Last project was ${hoursDiff.toFixed(1)}h ago - will ask for confirmation`)
            } else {
                console.log(`[Node: Validate] Last project was ${hoursDiff.toFixed(1)}h ago - need to ask which project`)
            }
        }

        if (needsProjectSelection) {
            missingFields.push('projectId')
        } else if (needsProjectConfirmation) {
            missingFields.push('projectConfirmation')
        }
    }

    const isValid = missingFields.length === 0 && invalidFields.length === 0
    console.log(`[Node: Validate] Valid: ${isValid}, Missing: ${missingFields.join(', ')}`)

    return {
        validation: {
            isValid,
            missingFields,
            invalidFields,
            inconsistencyReason: null,
        }
    }
}

// ============================================================================
// NODE: Respond
// ============================================================================

export async function respondNode(state: BrainState): Promise<Partial<BrainState>> {
    console.log(`[Node: Respond] Generating response`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const bucket = state.bucket!
    const validation = state.validation
    const extraction = state.extraction
    const attempts = state.attempts

    // Get language: prefer member's stored preference, then LLM detection, then default to English
    const lang = state.member?.language_preference || extraction?.responseLanguage || 'en'
    const ticketId = state.bucketId

    // LLM-based bilingual messages (include ticket # for context)
    // Make messages friendly and conversational!
    const workType = extraction?.workType || 'work'
    const projectName = state.bucket?.project_id ? '' : '' // Will be looked up when needed

    const msgs = lang === 'es' ? {
        clarify: '¿Puedes aclarar?',
        flagged: `📋 *Ticket #${ticketId}*\n marcado para revisión. He guardado los datos.`,
        savedBlanks: `📋 *Ticket #${ticketId}*\n guardado con datos incompletos. Lo arreglaremos después.`,
        success: (wt: string, h: number, proj: string, summary?: string) => {
            const base = `✅ *Ticket #${ticketId}*\n${wt} por ${h}h en ${proj}.`
            return summary ? `${base}\n\n📝 _"${summary}"_\n\n¡Registrado!` : `${base} ¡Registrado!`
        },
        askWorkType: `🔧 *Ticket #${ticketId}*\n ¿Qué tipo de trabajo hiciste?`,
        askHours: `⏱️ *Ticket #${ticketId}*\n Veo ${workType}. ¿Cuántas horas trabajaste? (agrega detalles si quieres)`,
        askSummary: `📝 *Ticket #${ticketId}*\n ¿Puedes describir brevemente lo que hiciste?`,
        askProject: `📍 *Ticket #${ticketId}*\n ¿En qué proyecto trabajaste?`,
        askProjectConfirmation: (pName: string) => `📍 *Ticket #${ticketId}*\n ¿Sigues en "${pName}"? (S/N)`,
    } : {
        clarify: 'Can you clarify?',
        flagged: `📋 *Ticket #${ticketId}*\n flagged for boss to check. I've saved the data.`,
        savedBlanks: `📋 *Ticket #${ticketId}*\n saved with blanks. We can fix it later.`,
        success: (wt: string, h: number, proj: string, summary?: string) => {
            const base = `✅ *Ticket #${ticketId}*\n${wt} for ${h}h at ${proj}.`
            return summary ? `${base}\n\n📝 _"${summary}"_\n\nLogged!` : `${base} Logged!`
        },
        askWorkType: `🔧 *Ticket #${ticketId}*\n What type of work did you do?`,
        askHours: `⏱️ *Ticket #${ticketId}*\n I see ${workType}. How many hours? (add details if you want)`,
        askSummary: `📝 *Ticket #${ticketId}*\n Can you briefly describe what you did?`,
        askProject: `📍 *Ticket #${ticketId}*\n Which project were you working on?`,
        askProjectConfirmation: (pName: string) => `📍 *Ticket #${ticketId}*\n Still at "${pName}"? (Y/N)`,
    }

    // Map field names to questions
    const fieldQuestions: Record<string, string> = {
        workType: msgs.askWorkType,
        hoursWorked: msgs.askHours,
        summary: msgs.askSummary,
        projectId: msgs.askProject,
    }

    // CASE 0: Spam/unrelated message - don't log, just respond with fallback
    const isSpamMessage = extraction?.isWorkRelated === false && state.attempts === 0
    if (isSpamMessage) {
        const spamResponse = lang === 'es'
            ? `👋 ¡Hola! Estoy aquí para registrar tu trabajo. Mándame una foto o dime qué hiciste hoy.`
            : `👋 Hey! I'm here to log your work. Send me a photo or tell me what you worked on today.`

        console.log(`[Node: Respond] Spam/unrelated message detected, sending fallback`)
        await sendWhatsAppMessage(bucket.from_phone, spamResponse, bucket.source)

        // Mark bucket as spam/ignored - don't count as validation attempt
        await supabase.from('buckets').update({
            status: 'ignored',
            ai_response: spamResponse,
        }).eq('id', state.bucketId)

        return { status: 'flagged', action: 'flagged', response: spamResponse }
    }

    // CASE 1: Inconsistency detected
    // Policy: Ask ONCE, then trust the user (they are the final authority on their work)
    // If user insists after one question, accept their answer and continue (flag for review)
    if (validation.inconsistencyReason) {
        if (attempts === 0) {
            // First time seeing inconsistency - ask for clarification ONCE
            const question = `⚠️ *Ticket #${ticketId}*\n ${validation.inconsistencyReason}\n${msgs.clarify}`
            await sendWhatsAppMessage(bucket.from_phone, question, bucket.source)
            await supabase.from('buckets').update({
                status: 'open',
                ai_response: question,
                validation_attempts: attempts + 1,
            }).eq('id', state.bucketId)

            return { status: 'open', action: 'ask_clarification', response: question }
        } else {
            // User already answered once - TRUST THEM and proceed
            // Clear the inconsistency so validation passes, but note it for review
            console.log(`[Node: Respond] User insists after clarification - trusting their answer, clearing inconsistency`)

            // Update extraction to mark as consistent (user override)
            if (extraction) {
                extraction.isConsistent = true
                extraction.inconsistencyReason = null
            }

            // Note: We'll continue to CASE 2/3 below with cleared inconsistency
            // If there are other missing fields, ask those. Otherwise, file the work.
        }
    }

    // CASE 2: Missing fields
    if (validation.missingFields.length > 0) {
        if (attempts < 5) {
            // IMPORTANT: Reorder fields so work details come FIRST, project LAST
            // Priority: workType -> hoursWorked -> summary -> projectId/projectConfirmation
            const workFields = validation.missingFields.filter(f => !f.startsWith('project'))
            const projectFields = validation.missingFields.filter(f => f.startsWith('project'))
            const orderedFields = [...workFields, ...projectFields]
            const field = orderedFields[0]

            let question: string

            // Save current extraction to bucket for next turn
            if (extraction) {
                await supabase.from('buckets').update({
                    extraction_json: JSON.stringify(extraction)
                }).eq('id', state.bucketId)
            }

            // Special handling for project confirmation (within 2-hour window)
            if (field === 'projectConfirmation' && state.member?.last_confirmed_project_id) {
                // Fetch the project name
                const { data: project } = await supabase
                    .from('projects')
                    .select('name')
                    .eq('id', state.member.last_confirmed_project_id)
                    .single()

                const projectName = project?.name || 'your last project'
                question = msgs.askProjectConfirmation(projectName)
            }
            // Special handling for projectId - send numbered list
            else if (field === 'projectId') {
                // Fetch projects for this node (excluding Inbox - same query as resolveProjectNode!)
                const { data: projects } = await supabase
                    .from('projects')
                    .select('id, name')
                    .eq('node_id', bucket.node_id)
                    .eq('is_active', true)
                    .eq('is_inbox', false)  // Exclude Inbox project
                    .order('name')
                    .limit(10)

                if (projects && projects.length > 0) {
                    const projectList = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
                    question = lang === 'es'
                        ? `📍 *Ticket #${ticketId}*\n ¿En qué proyecto trabajaste?\n\n${projectList}\n\nResponde con el número.`
                        : `📍 *Ticket #${ticketId}*\n Which project were you working on?\n\n${projectList}\n\nReply with the number.`
                } else {
                    question = fieldQuestions[field] || `What is the ${field}?`
                }
            }
            else {
                question = fieldQuestions[field] || `What is the ${field}?`
            }

            await sendWhatsAppMessage(bucket.from_phone, question, bucket.source)
            await supabase.from('buckets').update({
                status: 'open',
                ai_response: question,
                validation_attempts: attempts + 1,
            }).eq('id', state.bucketId)

            return { status: 'open', action: 'ask_missing', response: question }
        } else {
            await sendWhatsAppMessage(bucket.from_phone, msgs.savedBlanks, bucket.source)
            await supabase.from('buckets').update({ status: 'pending_review' }).eq('id', state.bucketId)

            return { status: 'pending_review', action: 'flagged', response: msgs.savedBlanks }
        }
    }

    // CASE 3: Success - create transaction
    if (extraction) {
        // Log project state before creating transaction
        console.log(`[Node: Respond] Creating transaction with project_id: ${bucket.project_id}, projectConfirmed: ${state.projectConfirmed}`)

        const txn = {
            bucket_id: state.bucketId,
            company_id: bucket.node_id,
            user_id: bucket.member_id,
            project_id: bucket.project_id,
            job: extraction.summary,
            time: extraction.hoursWorked,
            labor: extraction.workType || extraction.summary,  // Use workType, not entire conversation
            material: Array.isArray(extraction.materials) ? extraction.materials.join(', ') : null,
            evidence: state.imageUrls.length > 0 ? JSON.stringify(state.imageUrls) : null,
            scope_description: extraction.summary,
            status: 'COMPLETED',
        }

        console.log(`[Node: Respond] Transaction payload:`, JSON.stringify(txn))
        const { error: txnError } = await supabase.from('txns').insert(txn)
        if (txnError) {
            console.error(`[Node: Respond] Transaction insert error:`, txnError)
        }

        await supabase.from('buckets').update({
            status: 'submitted',
            summary: extraction.summary || null
        }).eq('id', state.bucketId)

        // Look up project name for success message
        let projectNameForMsg = 'project'
        if (bucket.project_id) {
            const { data: proj } = await supabase.from('projects').select('name').eq('id', bucket.project_id).single()
            projectNameForMsg = proj?.name || 'project'
        }

        const confirmMsg = msgs.success(extraction.workType || 'work', extraction.hoursWorked || 0, projectNameForMsg, extraction.summary || undefined)
        await sendWhatsAppMessage(bucket.from_phone, confirmMsg, bucket.source)

        return { status: 'submitted', action: 'success', response: confirmMsg }
    }

    return { status: 'pending_review', action: 'error' }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildExtractionPrompt(transcript: string, imageAnalysis: string, lastBotMessage?: string): string {
    return `You are a construction foreman. Extract work log data and respond in the SAME LANGUAGE as the user.

**CONTEXT - LAST MESSAGE FROM BOT:**
${lastBotMessage || '[None - new conversation]'}

**USER INPUT:** (May be in English, Spanish, or any language)
${transcript || '[NO TEXT - user only sent an image]'}

**IMAGE ANALYSIS:** (What the photos show)
${imageAnalysis || 'No images'}

---

## HANDLING CORRECTIONS (CRITICAL!)

The input may contain a MULTI-TURN conversation with corrections:
- User: "masonry work"
- Bot: "You said masonry but photo shows rebar. Can you clarify?"
- User: "sorry, I meant rebar" OR "perdón, quise decir rebar"
→ Use "rebar" as the FINAL workType (the correction!)
→ isConsistent = TRUE (now matches)

**CORRECTION PHRASES to detect:**
English: "sorry", "I meant", "my bad", "actually", "no", "yes", "correct"
Spanish: "perdón", "lo siento", "quise decir", "en realidad", "sí", "correcto"

If user corrects themselves, USE THE CORRECTED work type.

---

## HANDLING PROJECT SELECTION (CRITICAL!):
If LAST BOT MESSAGE contains a numbered list of projects like "1. ProjectA\n2. ProjectB" and user replies with just a NUMBER (1, 2, 3, etc.):
→ Extract projectHint: THE NUMBER (e.g. "1", "2", "3")
→ DO NOT extract/change workType, hoursWorked, or summary - leave them NULL

If LAST BOT MESSAGE asked about a project with "(Y/N)" or "(S/N)" and user says:
- "Y", "y", "Yes", "Si", "Sí", "Correct" → Extract projectHint: "CONFIRMED"
- "N", "n", "No", "Nope", "Nah" → Extract projectHint: "NO"

If user names a project (e.g. "at Plaza", "for site 5"):
→ Extract projectHint: "Plaza" or "site 5" (the name mentioned)

---

## FOLLOW-UP TURN RULES (CRITICAL!):
If LAST BOT MESSAGE asked a specific question (like "How many hours?"), ONLY extract the relevant field:
- "How many hours?" → ONLY extract hoursWorked, leave others NULL
- "What type of work?" → ONLY extract workType, leave others NULL  
- "Which project?" with numbered list → ONLY extract projectHint (the number), leave others NULL

**DO NOT HALLUCINATE** values for fields that weren't asked about!

---

## RULES:
1. **NEVER HALLUCINATE!** If hours not stated, hoursWorked = null
2. Extract workType from USER's FINAL statement (after any corrections)
3. Compare FINAL workType against image - set isConsistent accordingly
4. **responseLanguage**: DEFAULT TO "en" (English). Only set to "es" if the user's CURRENT message is clearly written in Spanish (e.g., contains Spanish words like "trabajo", "horas", "perdón", etc.). If user sends only an image or writes in English, responseLanguage = "en"
5. **inconsistencyReason**: MUST be written in the language specified by responseLanguage - if "en", write in English; if "es", write in Spanish

## SPAM/IRRELEVANT MESSAGE DETECTION:
Set isWorkRelated = FALSE if message is:
- Random jokes, emojis only, gibberish, test messages
- Comments like "hello", "what's up", "lol", "haha", just greetings
- Completely unrelated to work (personal chat, memes, etc.)

Set isWorkRelated = TRUE if message:
- Mentions ANY work activity, materials, hours, or construction terms
- Contains a photo showing work/construction site
- Is a follow-up to a work conversation (answering bot's questions like hours/project)
- Even brief responses like "5" (hours) or "Y" (yes to project)

**BE GENEROUS - when in doubt, set isWorkRelated = TRUE**

## WORK TYPES:
"electrical" | "plumbing" | "hvac" | "carpentry" | "masonry" | "painting" | "rebar" | "concrete" | "general"

---

**EXTRACT (JSON only):**
1. workType: The FINAL/CORRECTED work type from user
2. hoursWorked: ONLY if user explicitly stated. Otherwise NULL.
3. summary: Brief description
4. materials: Materials visible/mentioned (array)
5. location: If stated, else null
6. projectHint: Project name OR "CONFIRMED" if agreeing to bot's project question. Otherwise NULL.
7. isConsistent: TRUE if FINAL work type matches image
8. inconsistencyReason: Only if FINAL type doesn't match image (write in responseLanguage!)
9. responseLanguage: DEFAULT "en". Only "es" if current user message is clearly Spanish
10. isWorkRelated: FALSE only if message is spam/mischief/completely unrelated

Return JSON only.`
}

async function transcribeAudio(url: string, groqApiKey: string): Promise<string | null> {
    try {
        // Fetch audio with Twilio auth
        const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
        const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
        const headers: Record<string, string> = {}
        if (twilioSid && twilioAuth && url.includes('twilio.com')) {
            headers['Authorization'] = `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`
        }

        const audioResp = await fetch(url, { headers })
        if (!audioResp.ok) return null

        const audioBlob = await audioResp.blob()
        const formData = new FormData()
        formData.append('file', audioBlob, 'audio.ogg')
        formData.append('model', 'whisper-large-v3')

        const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqApiKey}` },
            body: formData,
        })

        if (!resp.ok) return null
        const data = await resp.json()
        return data.text || null
    } catch (e) {
        console.error('[Transcribe] Error:', e)
        return null
    }
}

async function analyzeImage(url: string, groqApiKey: string): Promise<string> {
    try {
        // Fetch image with Twilio auth
        const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
        const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
        const headers: Record<string, string> = {}
        if (twilioSid && twilioAuth && url.includes('twilio.com')) {
            headers['Authorization'] = `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`
        }

        const imageResp = await fetch(url, { headers, redirect: 'follow' })
        if (!imageResp.ok) return 'Image could not be loaded'

        const contentType = imageResp.headers.get('content-type') || 'image/jpeg'
        const arrayBuffer = await imageResp.arrayBuffer()

        // Convert to base64 in chunks to avoid stack overflow on large images
        const uint8Array = new Uint8Array(arrayBuffer)
        const chunkSize = 8192
        let binaryString = ''
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize)
            binaryString += String.fromCharCode.apply(null, chunk as unknown as number[])
        }
        const base64 = btoa(binaryString)
        const dataUrl = `data:${contentType};base64,${base64}`

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    { role: 'system', content: 'Describe this construction/work image. List: Type of work, Materials visible, Completion status.' },
                    {
                        role: 'user', content: [
                            { type: 'text', text: 'Analyze this work photo:' },
                            { type: 'image_url', image_url: { url: dataUrl } }
                        ]
                    }
                ],
                temperature: 0.1,
                max_tokens: 500,
            }),
        })

        if (!response.ok) return 'Image analysis unavailable'
        const data = await response.json()
        return data.choices?.[0]?.message?.content || 'No analysis'
    } catch (e) {
        console.error('[Vision] Error:', e)
        return 'Image analysis failed'
    }
}

async function sendWhatsAppMessage(to: string, body: string, source: string): Promise<void> {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const fromNumber = source === 'whatsapp'
        ? Deno.env.get('TWILIO_FROM_WHATSAPP')!
        : Deno.env.get('TWILIO_FROM_NUMBER')!

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const formData = new URLSearchParams({
        To: source === 'whatsapp' ? `whatsapp:${to}` : to,
        From: fromNumber,
        Body: body,
    })

    await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
    })
}
