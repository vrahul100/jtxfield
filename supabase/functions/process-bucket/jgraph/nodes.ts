// Jentyx Node Implementations for Adaptive Brain
// Each node is a pure function that takes state and returns partial state updates

import { createClient } from '@supabase/supabase-js'
import type { BrainState, ExtractionResult, ValidationResult } from './state.ts'
import type { Bucket, Member } from './types.ts'
import { generateAudioResponse } from './tts.ts'

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
        lastQuestionType: (bucket as any).last_question_type || null,  // Load conversation context
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

    // Track if user sent audio (for modality-matching responses)
    if (state.audioUrls.length > 0) {
        updates.inputHasAudio = true
    }

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
    console.log(`[Node: ResolveProject] Initial hint from extraction: "${hint}"`)
    console.log(`[Node: ResolveProject] Last question type: ${state.lastQuestionType}`)

    // Fallback: If no hint, check raw text for confirmation words OR a number
    // Interpret response BASED ON WHAT WE LAST ASKED (state.lastQuestionType)
    if (!hint && state.rawText) {
        let raw = state.rawText
        if (raw.includes('\nA:')) {
            const parts = raw.split('\nA:')
            raw = parts[parts.length - 1].trim()
        } else {
            raw = raw.trim()
        }
        const rawLower = raw.toLowerCase()
        console.log(`[Node: ResolveProject] Checking raw text: "${rawLower.substring(0, 50)}..."`)

        const firstWord = rawLower.split(/[\s.,!]/)[0]

        // If last question was "anything else?" - "no" means proceed to project, not reject
        if (state.lastQuestionType === 'anything_else') {
            if (['no', 'n', 'nope', 'nah'].includes(firstWord)) {
                console.log(`[Node: ResolveProject] User said NO to "anything else?" - proceeding to project`)
                // Return empty - will trigger project question on next round
                return { askedAnythingElse: true }  // Mark as answered, proceed to project
            }
            // If they add more info, let extraction handle it
            console.log(`[Node: ResolveProject] User added more info to "anything else?" - extraction will handle`)
            return {}
        }

        // If last question was project confirmation (Y/N)
        if (state.lastQuestionType === 'project_confirm') {
            if (['yes', 'y', 'si', 'sí', 'yeah', 'yep'].includes(firstWord)) {
                console.log(`[Node: ResolveProject] User confirmed project`)
                hint = 'CONFIRMED'
            } else if (['no', 'n', 'nope', 'nah'].includes(firstWord)) {
                console.log(`[Node: ResolveProject] User rejected project - will show list`)
                hint = 'NO'
            }
        }

        // If last question was project selection (numbered list)
        if (state.lastQuestionType === 'project_select') {
            if (/^(\d+)[\.)]?/.test(rawLower)) {
                const match = rawLower.match(/^(\d+)/)
                hint = match ? match[1] : rawLower
                console.log(`[Node: ResolveProject] User selected project number: ${hint}`)
            }
        }
    }

    if (!hint) {
        console.log(`[Node: ResolveProject] No projectHint found, skipping`)
        return {}
    }

    console.log(`[Node: ResolveProject] Final hint: "${hint}"`)

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

    // CASE A: User confirmed "YES" to project question (e.g., "At Downtown Office? (Y/N)")
    // Extract the project name from the bot's last message and look it up
    if (['confirmed', 'yes', 'si', 'confirmado', 'sí', 'yeah', 'yep', 'yup', 'y'].includes(hint.toLowerCase())) {
        // Try to extract project name from bot's last message
        // e.g., "drain for 6.5h. At Downtown Office Renovation? (Y/N)" -> "Downtown Office Renovation"
        const lastMsgRaw = state.bucket?.ai_response || ''

        // Pattern: "At [Project Name]? (Y/N)" or "En [Project Name]? (S/N)"
        const atMatch = lastMsgRaw.match(/(?:At|at|En|en)\s+([^?]+?)\s*\?\s*\((?:Y\/N|S\/N)\)/i)
        const projectNameFromQuestion = atMatch ? atMatch[1].trim() : null

        if (projectNameFromQuestion) {
            // Look up project by name
            const { data: projects } = await supabase
                .from('projects')
                .select('id, name')
                .eq('node_id', state.bucket?.node_id)
                .ilike('name', `%${projectNameFromQuestion}%`)
                .limit(1)

            if (projects && projects.length > 0) {
                console.log(`[Node: ResolveProject] User confirmed project from question: "${projectNameFromQuestion}" -> ID ${projects[0].id}`)
                resolvedProjectId = projects[0].id
            } else {
                console.log(`[Node: ResolveProject] Could not find project "${projectNameFromQuestion}" by name, trying last_confirmed`)
                // Fallback to member's last confirmed
                if (state.member?.last_confirmed_project_id) {
                    resolvedProjectId = state.member.last_confirmed_project_id
                }
            }
        } else if (state.member?.last_confirmed_project_id && isConfirmationQuestion) {
            // Fallback: no project name in message, use last confirmed
            console.log(`[Node: ResolveProject] User confirmed, using last_confirmed_project_id: ${state.member.last_confirmed_project_id}`)
            resolvedProjectId = state.member.last_confirmed_project_id
        } else {
            console.log(`[Node: ResolveProject] User said YES/CONFIRM, but couldn't find project to confirm. Ignoring.`)
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

    // Dynamic values for natural responses
    const workType = extraction?.workType || 'work'
    const hours = extraction?.hoursWorked
    const hasWork = extraction?.workType != null
    const hasHours = extraction?.hoursWorked != null && extraction.hoursWorked > 0

    // Get default project name if member has recent project
    const memberProjectName = state.member?.last_confirmed_project_id ? 'your current project' : null

    // ============================================================================
    // CONVERSATION FLOW PATTERN
    // Step 1: Get work info → Step 2: "Anything else?" → Step 3: Ask project
    // ============================================================================

    const msgs = lang === 'es' ? {
        // Acknowledgments - terse, confident
        captured: 'Capturado.',
        noted: 'Anotado.',
        gotIt: 'Listo.',

        // Fallbacks
        clarify: '¿Puedes aclarar?',
        flagged: `✅ Guardado. Tu supervisor completará los detalles.`,
        savedBlanks: `✅ Guardado con lo que tengo.`,

        // Success - state the action, don't ask
        success: (wt: string, h: number, proj: string, summary?: string) => {
            const base = `✅ ${wt} por ${h}h en ${proj}.`
            return summary ? `${base}\n_"${summary}"_` : base
        },

        // "Anything else?" step - BEFORE project
        anythingElse: (wt: string, h: number) =>
            `${wt} por ${h}h. ¿Algo más que agregar?`,

        // Only ask when we truly can't assume
        needWorkType: `Capturado. ¿Qué tipo de trabajo?`,
        needProject: (wt: string, h: number) =>
            `${wt} por ${h}h. ¿En cuál proyecto?`,

        fallbackGreeting: `👋 Mándame una foto o cuéntame qué hiciste.`,
    } : {
        // Acknowledgments - terse, confident
        captured: 'Captured.',
        noted: 'Noted.',
        gotIt: 'Got it.',

        // Fallbacks
        clarify: 'Can you clarify?',
        flagged: `✅ Saved. Your supervisor will fill in details.`,
        savedBlanks: `✅ Saved with what I have.`,

        // Success - state the action, don't ask
        success: (wt: string, h: number, proj: string, summary?: string) => {
            const base = `✅ ${wt} for ${h}h at ${proj}.`
            return summary ? `${base}\n_"${summary}"_` : base
        },

        // "Anything else?" step - BEFORE project
        anythingElse: (wt: string, h: number) =>
            `${wt} for ${h}h. Anything else to add?`,

        // Only ask when we truly can't assume
        needWorkType: `Captured. What kind of work?`,
        needProject: (wt: string, h: number) =>
            `${wt} for ${h}h. Which project?`,

        fallbackGreeting: `👋 Send me a photo or tell me what you worked on.`,
    }

    // Helper: Build response based on new flow
    // Step 1: Get work info → Step 2: "Anything else?" → Step 3: Ask project
    function buildResponse(): { message: string, askingAnythingElse: boolean } {
        const wt = extraction?.workType
        const h = extraction?.hoursWorked || 0

        // Missing work type - must ask
        if (!wt) {
            return { message: msgs.needWorkType, askingAnythingElse: false }
        }

        // Have work type + hours, haven't asked "anything else?" yet, not confirmed project
        // → Ask "anything else?" before project
        if (wt && h > 0 && !state.askedAnythingElse && !state.projectConfirmed) {
            return { message: msgs.anythingElse(wt, h), askingAnythingElse: true }
        }

        // Already asked anything else, or project confirmed - ask for project if needed
        if (!state.projectConfirmed) {
            return { message: msgs.needProject(wt, h), askingAnythingElse: false }
        }

        // All done
        return { message: '', askingAnythingElse: false }
    }

    // CASE 0: Spam/unrelated message - don't log, just respond with fallback
    const isSpamMessage = extraction?.isWorkRelated === false && state.attempts === 0
    if (isSpamMessage) {
        const spamResponse = msgs.fallbackGreeting

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

    // CASE 2: Missing fields - New flow: work info → "anything else?" → project
    if (validation.missingFields.length > 0) {
        if (attempts < 3) {
            // Use helper for new flow
            const { message, askingAnythingElse } = buildResponse()

            // Save current extraction for next turn
            if (extraction) {
                await supabase.from('buckets').update({
                    extraction_json: JSON.stringify(extraction)
                }).eq('id', state.bucketId)
            }

            let response = message

            // Special case: projectId with numbered list
            const field = validation.missingFields[0]
            if ((field === 'projectId' || field === 'projectConfirmation') && !askingAnythingElse) {
                // Fetch last project name if asking for confirmation
                if (field === 'projectConfirmation' && state.member?.last_confirmed_project_id) {
                    const { data: project } = await supabase
                        .from('projects')
                        .select('name')
                        .eq('id', state.member.last_confirmed_project_id)
                        .single()

                    const projectName = project?.name || 'your last project'
                    const wt = extraction?.workType || 'work'
                    const h = extraction?.hoursWorked || 0
                    response = lang === 'es'
                        ? `${wt} por ${h}h. ¿En ${projectName}? (S/N)`
                        : `${wt} for ${h}h. At ${projectName}? (Y/N)`
                } else if (field === 'projectId') {
                    // Fetch projects and show numbered list
                    const { data: projects } = await supabase
                        .from('projects')
                        .select('id, name')
                        .eq('node_id', bucket.node_id)
                        .eq('is_active', true)
                        .eq('is_inbox', false)
                        .order('name')
                        .limit(10)

                    if (projects && projects.length > 0) {
                        const wt = extraction?.workType || 'work'
                        const h = extraction?.hoursWorked || 0
                        const projectList = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
                        response = lang === 'es'
                            ? `${wt} por ${h}h.\n\n${projectList}\n\n¿Cuál?`
                            : `${wt} for ${h}h.\n\n${projectList}\n\nWhich one?`
                    }
                }
            }

            await sendWhatsAppMessage(bucket.from_phone, response, bucket.source)

            // Determine what type of question we just asked BEFORE the update
            const missingField = validation.missingFields[0]
            let questionType: string | null = null
            if (askingAnythingElse) {
                questionType = 'anything_else'
            } else if (missingField === 'workType') {
                questionType = 'work_type'
            } else if (missingField === 'hoursWorked') {
                questionType = 'hours'
            } else if (missingField === 'projectConfirmation') {
                questionType = 'project_confirm'
            } else if (missingField === 'projectId') {
                questionType = 'project_select'
            }

            // PERSIST to database so next message knows context
            await supabase.from('buckets').update({
                status: 'open',
                ai_response: response,
                validation_attempts: attempts + 1,
                last_question_type: questionType,  // Persist question type!
            }).eq('id', state.bucketId)

            // Return with state tracking
            return {
                status: 'open',
                action: 'ask_missing',
                response,
                askedAnythingElse: askingAnythingElse ? true : state.askedAnythingElse,
                lastQuestionType: questionType as 'work_type' | 'hours' | 'anything_else' | 'project_confirm' | 'project_select' | null
            }
        } else {
            // Graceful fallback: save what we have
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

        // Generate audio response if TTS is enabled AND user sent voice message (modality matching)
        // TTS is disabled by default - set TTS_ENABLED=true to enable
        let audioUrl: string | null = null
        const ttsEnabled = Deno.env.get('TTS_ENABLED') === 'true'
        if (ttsEnabled && state.inputHasAudio) {
            console.log(`[Node: Respond] TTS enabled + user sent voice - generating audio response`)
            audioUrl = await generateAudioResponse(confirmMsg, lang as 'en' | 'es', state.bucketId)
        } else if (state.inputHasAudio && !ttsEnabled) {
            console.log(`[Node: Respond] User sent voice but TTS disabled (set TTS_ENABLED=true to enable)`)
        }

        await sendWhatsAppMessage(bucket.from_phone, confirmMsg, bucket.source, audioUrl || undefined)

        return { status: 'submitted', action: 'success', response: confirmMsg, responseAudioUrl: audioUrl }
    }

    return { status: 'pending_review', action: 'error' }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildExtractionPrompt(transcript: string, imageAnalysis: string, lastBotMessage?: string): string {
    return `You are a construction foreman's AI assistant. Extract ALL work log data from user's message.

**CONTEXT - LAST MESSAGE FROM BOT:**
${lastBotMessage || '[None - new conversation]'}

**USER INPUT:**
${transcript || '[NO TEXT - user only sent an image]'}

**IMAGE ANALYSIS:**
${imageAnalysis || 'No images'}

---

## CRITICAL: EXTRACT ALL SIGNALS FROM USER MESSAGE

Users often provide MULTIPLE pieces of information in one message. Extract EVERYTHING mentioned.

Example:
- Bot: "drain work for 6.5h. At Downtown Office? (Y/N)"
- User: "also did concrete for 4 hours. Yes"

You MUST extract:
- workType: "concrete" (or merge: "drain installation and concrete")
- hoursWorked: 4 (user explicitly said 4 hours - this OVERRIDES previous)
- projectHint: "CONFIRMED" (user said "Yes" to project question)
- summary: updated to include concrete work

**DO NOT IGNORE** parts of the message just because you're focused on one question!

---

## PROJECT CONFIRMATION DETECTION

If LAST BOT MESSAGE asked about a project (contains "Y/N" or "S/N" or project name):
- "Y", "y", "Yes", "yes", "Si", "Sí", "yeah", "yep", "correct" → projectHint: "CONFIRMED"
- "N", "n", "No", "no", "Nope", "nah" → projectHint: "NO"

**IMPORTANT:** User may confirm AND provide other info. Look for confirmation words ANYWHERE in their message.

---

## PROJECT NUMBER SELECTION

If LAST BOT MESSAGE shows numbered list (1. Project, 2. Project...):
- User replies "1" or "2" → projectHint: that number as string
- User may also add other info like hours - extract those too!

---

## HOURS EXTRACTION

Look for hours ANYWHERE in the message:
- "4 hours", "4h", "4 hrs" → hoursWorked: 4
- "half hour", "30 min" → hoursWorked: 0.5
- "all day", "full day" → hoursWorked: 8

If user provides new hours, OVERRIDE previous - user is correcting.

---

## WORK TYPE UPDATES

If user mentions NEW work in their response, UPDATE/MERGE:
- "also did concrete" → add to summary, may update workType
- "and finished drywall" → add to summary

---

## RULES:
1. Extract ALL information from user message, not just what was asked
2. If user provides hours, USE THEM (override defaults)
3. If user confirms project (Yes/Y/Si), set projectHint: "CONFIRMED"
4. responseLanguage: "en" unless user writes clearly in Spanish
5. isWorkRelated: TRUE for any work-related content

## WORK TYPES:
"electrical" | "plumbing" | "hvac" | "carpentry" | "masonry" | "painting" | "rebar" | "concrete" | "drain" | "general"

---

**EXTRACT (JSON only):**
1. workType: Work type (may combine multiple: "drain and concrete")
2. hoursWorked: Hours if user stated ANY number. NULL only if truly not mentioned.
3. summary: Brief description of ALL work mentioned
4. materials: Materials visible/mentioned (array)
5. location: If stated, else null
6. projectHint: "CONFIRMED", "NO", project number, or project name. NULL if not mentioned.
7. isConsistent: TRUE if work matches image
8. inconsistencyReason: Only if mismatch
9. responseLanguage: "en" or "es"
10. isWorkRelated: TRUE for work content

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

async function sendWhatsAppMessage(to: string, body: string, source: string, mediaUrl?: string): Promise<void> {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const fromNumber = source === 'whatsapp'
        ? Deno.env.get('TWILIO_FROM_WHATSAPP')!
        : Deno.env.get('TWILIO_FROM_NUMBER')!

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const params = new URLSearchParams({
        To: source === 'whatsapp' ? `whatsapp:${to}` : to,
        From: fromNumber,
        Body: body,
    })

    // Add audio/media attachment if provided
    if (mediaUrl) {
        params.append('MediaUrl', mediaUrl)
        console.log(`[SendMessage] 🔊 Including audio attachment: ${mediaUrl}`)
    }

    await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    })
}
