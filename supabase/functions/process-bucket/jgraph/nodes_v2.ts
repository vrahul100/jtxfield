// nodes_v2.ts - Clean State Handlers with Media Processing & Bilingual Support
// State transitions, conversation flow, transcription, LLM extraction, and EN/ES responses

import { createClient } from '@supabase/supabase-js'

// ============================================================================
// TYPES
// ============================================================================

interface ExtractionResult {
    workType: string | null
    hoursWorked: number | null
    summary: string | null
    materials: string[]
    location: string | null
    projectHint: string | null
    isConsistent: boolean
    inconsistencyReason: string | null
    responseLanguage: 'en' | 'es'
    isWorkRelated: boolean
}

interface StateContext {
    bucketId: number
    bucket: any
    member: any
    extraction: ExtractionResult
    transcripts: string[]
    imageAnalysis: string
    language: 'en' | 'es'
}

interface StateResult {
    nextState: string | null  // null = stay in current state (waiting for response)
    response: string | null
    extraction?: ExtractionResult
    projectId?: number | null
}

// ============================================================================
// BILINGUAL MESSAGES
// ============================================================================

const MESSAGES = {
    en: {
        collectWork: '🔧 *What kind of work did you do?*\n\nAlso tell me how many hours.\n(Example: "electrical for 6 hours")',
        askHours: (wt: string) => `⏱️ Got it: *${wt}* work\n\nHow many hours did you work?\n(Example: 6.5 or "6 and a half")`,
        clarify: (reason: string) => `⚠️ *NEEDS CLARIFICATION*\n\n${reason}\n\nCan you provide more details?`,
        confirmAll: (wt: string, h: number, proj: string, materials?: string, location?: string) => {
            let msg = `📝 *CONFIRM YOUR WORK*\n\n🔧 *Work:* ${wt}\n⏱️ *Time:* ${h} hours\n📍 *Project:* ${proj}`
            if (materials) msg += `\n🧰 *Materials:* ${materials}`
            if (location) msg += `\n📌 *Location:* ${location}`
            msg += `\n\nIs this correct? Reply *Y* or *N*`
            return msg
        },
        confirmProject: (wt: string, h: number, proj: string) => `📝 *CONFIRM PROJECT*\n\n🔧 ${wt}\n⏱️ ${h} hours\n\nAt *${proj}*?\n\nReply *Y* or *N*`,
        selectProject: (wt: string, h: number, list: string, count: number) => {
            const options = count === 1 ? '1' : count === 2 ? '1 or 2' : Array.from({length: count}, (_, i) => i + 1).join(', ').replace(/, ([^,]*)$/, ', or $1')
            return `📌 *SELECT PROJECT*\n\n🔧 ${wt} • ${h}h\n\n${list}\n\nReply with number (${options})`
        },
        success: (wt: string, h: number, proj: string, materials?: string, location?: string, summary?: string) => {
            let msg = `✅ *LOGGED*\n\n🔧 *Work:* ${wt}\n⏱️ *Time:* ${h} hours\n📍 *Project:* ${proj}`
            if (materials) msg += `\n🧰 *Materials:* ${materials}`
            if (location) msg += `\n📌 *Location:* ${location}`
            if (summary) msg += `\n\n_"${summary}"_`
            return msg
        },
        logged: '✅ Logged!',
        noProjects: '❌ No projects available',
        // Fallback for non-work messages
        notWorkRelated: '👋 Hi! I\'m your work logging assistant.\n\nTo log work, send:\n• A photo of completed work\n• A voice note describing what you did\n• Text like "electrical 6 hours"\n\n💡 _Example: "Replaced outlet covers, 2 hours"_',
        greeting: '👋 Hello! Ready to log your work?\n\nSend a photo, voice note, or describe what you worked on.',
    },
    es: {
        collectWork: '🔧 *¿Qué tipo de trabajo hiciste?*\n\nTambién dime cuántas horas.\n(Ejemplo: "eléctrico por 6 horas")',
        askHours: (wt: string) => `⏱️ Entendido: trabajo de *${wt}*\n\n¿Cuántas horas trabajaste?\n(Ejemplo: 6.5 o "6 y media")`,
        clarify: (reason: string) => `⚠️ *NECESITA ACLARACIÓN*\n\n${reason}\n\n¿Puedes dar más detalles?`,
        confirmAll: (wt: string, h: number, proj: string, materials?: string, location?: string) => {
            let msg = `📝 *CONFIRMA TU TRABAJO*\n\n🔧 *Trabajo:* ${wt}\n⏱️ *Tiempo:* ${h} horas\n📍 *Proyecto:* ${proj}`
            if (materials) msg += `\n🧰 *Materiales:* ${materials}`
            if (location) msg += `\n📌 *Ubicación:* ${location}`
            msg += `\n\n¿Es correcto? Responde *S* o *N*`
            return msg
        },
        confirmProject: (wt: string, h: number, proj: string) => `📝 *CONFIRMA PROYECTO*\n\n🔧 ${wt}\n⏱️ ${h} horas\n\n¿En *${proj}*?\n\nResponde *S* o *N*`,
        selectProject: (wt: string, h: number, list: string, count: number) => {
            const options = count === 1 ? '1' : count === 2 ? '1 o 2' : Array.from({length: count}, (_, i) => i + 1).join(', ').replace(/, ([^,]*)$/, ', o $1')
            return `📌 *SELECCIONA PROYECTO*\n\n🔧 ${wt} • ${h}h\n\n${list}\n\nResponde con número (${options})`
        },
        success: (wt: string, h: number, proj: string, materials?: string, location?: string, summary?: string) => {
            let msg = `✅ *REGISTRADO*\n\n🔧 *Trabajo:* ${wt}\n⏱️ *Tiempo:* ${h} horas\n📍 *Proyecto:* ${proj}`
            if (materials) msg += `\n🧰 *Materiales:* ${materials}`
            if (location) msg += `\n📌 *Ubicación:* ${location}`
            if (summary) msg += `\n\n_"${summary}"_`
            return msg
        },
        logged: '✅ ¡Registrado!',
        noProjects: '❌ No hay proyectos disponibles',
        // Fallback for non-work messages
        notWorkRelated: '👋 ¡Hola! Soy tu asistente de registro de trabajo.\n\nPara registrar trabajo, envía:\n• Una foto del trabajo terminado\n• Una nota de voz describiendo lo que hiciste\n• Texto como "eléctrico 6 horas"\n\n💡 _Ejemplo: "Cambié tapas de enchufes, 2 horas"_',
        greeting: '👋 ¡Hola! ¿Listo para registrar tu trabajo?\n\nEnvía una foto, nota de voz, o describe lo que trabajaste.',
    }
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

// Get the last user input from BOTH text AND transcripts (multimodal)
// This ensures voice notes are treated equally to text messages
function getLastUserInput(rawText: string, transcripts: string[]): string {
    const textLines = (rawText || '').split('\n').filter(line => line.trim() !== '')
    const lastText = textLines.length > 0 ? textLines[textLines.length - 1] : ''
    const lastTranscript = transcripts.length > 0 ? transcripts[transcripts.length - 1] : ''
    
    // Prefer transcript if available (voice is typically the most recent response)
    const combined = lastTranscript || lastText
    console.log(`[getLastUserInput] text="${lastText.substring(0, 30)}" transcript="${lastTranscript.substring(0, 30)}" → "${combined.substring(0, 30)}"`)
    return combined.toLowerCase().trim()
}

// Add bold ticket number prefix to response (WhatsApp markdown)
function withTicket(bucketId: number, response: string): string {
    return `*TICKET #${bucketId}*\n${response}`
}

// Add ticket prefix and optional dev mode state info to response
function withDevInfo(bucketId: number, response: string, state: string, extraction: ExtractionResult, attempts: number, lastMsg?: string): string {
    // Always add ticket prefix
    let result = withTicket(bucketId, response)
    
    // Add dev info if dev mode
    if (DEV_MODE) {
        const ext = `workType:${extraction.workType || '-'} hours${extraction.hoursWorked || '-'}`
        const msgPart = lastMsg ? ` lastMsg:"${lastMsg.substring(0, 20)}"` : ''
        result = `${result}\n\n_[DEV: state=${state}, ${ext}, attempts=${attempts}${msgPart}]_`
    }
    
    return result
}

// Send WhatsApp message
async function sendMessage(phone: string, message: string, source: string) {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const fromNumber = Deno.env.get('TWILIO_FROM_WHATSAPP')!

    console.log(`[Send] To ${phone}: ${message}`)

    const params = new URLSearchParams({
        To: source === 'whatsapp' ? `whatsapp:${phone}` : phone,
        From: fromNumber,    
        Body: message,
    })
    console.log(`[Send] To ${phone}: ${message}`)
    console.log(`[Send] From ${fromNumber}`)
    console.log(`[Send] Params ${params.toString()}`)
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
// TIMEOUT UTILITY
// ============================================================================

// Wrap a promise with a timeout to prevent hanging
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    const timeout = new Promise<T>((resolve) => {
        setTimeout(() => {
            console.log(`[Timeout] Operation timed out after ${ms}ms`)
            resolve(fallback)
        }, ms)
    })
    return Promise.race([promise, timeout])
}

// ============================================================================
// MEDIA PROCESSING (with timeouts)
// ============================================================================

// Transcribe audio using Whisper via Groq
async function transcribeAudio(url: string): Promise<string | null> {
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) return null

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
        console.log(`[Transcribe] Result: "${data.text?.substring(0, 50)}..."`)
        return data.text || null
    } catch (e) {
        console.error('[Transcribe] Error:', e)
        return null
    }
}

// Analyze image using Llama vision
async function analyzeImage(url: string): Promise<string> {
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) return 'Image analysis unavailable'

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

        // Convert to base64 in chunks to avoid stack overflow
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
        const analysis = data.choices?.[0]?.message?.content || 'No analysis'
        console.log(`[Vision] Analysis: "${analysis.substring(0, 80)}..."`)
        return analysis
    } catch (e) {
        console.error('[Vision] Error:', e)
        return 'Image analysis failed'
    }
}

// Build extraction prompt for LLM
function buildExtractionPrompt(transcript: string, imageAnalysis: string, lastBotMessage?: string, existingExtraction?: ExtractionResult): string {
    const existingContext = existingExtraction ? `
**EXISTING EXTRACTION (from previous messages):**
- Work Type: ${existingExtraction.workType || 'none'}
- Hours: ${existingExtraction.hoursWorked || 0}
- Summary: ${existingExtraction.summary || 'none'}
- Materials: ${existingExtraction.materials?.join(', ') || 'none'}
- Location: ${existingExtraction.location || 'none'}

IMPORTANT: Intelligently merge the new user input with the existing extraction:
- If user says "also", "more", "another", "additionally" → ADD to existing values
- If user says "actually", "correct", "it was", "make it", "change to" → REPLACE existing values  
- If user just adds new details without corrections → APPEND to summary, ADD materials, etc.
` : ''

    return `You are a construction foreman's AI assistant. Extract work log data from user's message.
${existingContext}
**CONTEXT - LAST MESSAGE FROM BOT:**
${lastBotMessage || '[None - new conversation]'}

**USER INPUT:**
${transcript || '[NO TEXT - user only sent an image]'}

**IMAGE ANALYSIS:**
${imageAnalysis || 'No images'}

---

## EXTRACTION RULES:
1. workType: "electrical" | "plumbing" | "hvac" | "carpentry" | "masonry" | "painting" | "rebar" | "concrete" | "drain" | "general"
2. hoursWorked: HEAVILY prioritize finding hours in USER INPUT and [Voice] transcripts. 
   - Look for phrases like "took me 6.5 hours", "worked 4h", "it was 8 hours".
   - Return hours as a JSON number (e.g., 6.5).
   - If user says "another 3 hours" or "3 more hours" → return ONLY the additional hours (3).
   - If user says "actually 5 hours" or "make it 5 hours" → return the corrected total (5).
3. summary: Brief description of work
4. projectHint: "CONFIRMED" if user said Yes/Y/Si, "NO" if they rejected, or project name/number
5. responseLanguage: "en" unless user writes in Spanish → "es"
6. isConsistent: TRUE if text matches image
7. isWorkRelated: TRUE for work content, FALSE for spam/unrelated

**RETURN JSON ONLY:**
{
  "workType": string | null,
  "hoursWorked": number | null,
  "summary": string,
  "materials": string[],
  "location": string | null,
  "projectHint": string | null,
  "isConsistent": boolean,
  "inconsistencyReason": string | null,
  "responseLanguage": "en" | "es",
  "isWorkRelated": boolean
}`
}

// Extract data using LLM
async function extractWithLLM(rawText: string, transcripts: string[], imageAnalysis: string, lastBotMessage?: string, existingExtraction?: ExtractionResult): Promise<ExtractionResult | null> {
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) return null

    const allText = [
        rawText,
        ...transcripts.map(t => `[Voice]: ${t}`)
    ].filter(Boolean).join('\n')

    const prompt = buildExtractionPrompt(allText, imageAnalysis, lastBotMessage, existingExtraction)

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            }),
        })

        if (!response.ok) {
            console.error('[Extract] API error:', await response.text())
            return null
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content
        const extraction = JSON.parse(content) as ExtractionResult
        console.log(`[Extract] Result: workType=${extraction.workType}, hours=${extraction.hoursWorked}, lang=${extraction.responseLanguage}`)
        return extraction
    } catch (e) {
        console.error('[Extract] Error:', e)
        return null
    }
}

// Refine extraction with regex (fallback for when LLM misses obvious data)
function refineExtractionWithRegex(extraction: ExtractionResult, rawText: string, transcripts: string[]): ExtractionResult {
    // Only refine if hours are missing
    if (extraction.hoursWorked !== null && extraction.hoursWorked !== undefined) {
        return extraction
    }

    const combinedText = [rawText, ...transcripts].join(' ')
    // Regex for hours: "6.5 hours", "6.5h", "6.5 hrs", "6.5 hours worked"
    const hoursMatch = combinedText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/i)
    
    if (hoursMatch) {
        const hours = parseFloat(hoursMatch[1])
        console.log(`[RegexRefine] Found hours via regex: ${hours}`)
        return {
            ...extraction,
            hoursWorked: hours
        }
    }

    return extraction
}

// Create default extraction result
function createDefaultExtraction(): ExtractionResult {
    return {
        workType: null,
        hoursWorked: null,
        summary: null,
        materials: [],
        location: null,
        projectHint: null,
        isConsistent: true,
        inconsistencyReason: null,
        responseLanguage: 'en',
        isWorkRelated: true,
    }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function runStateMachine(bucketId: number): Promise<{ status: string; action: string }> {
    console.log(`[StateMachine] Starting for bucket #${bucketId}`)

    const supabase = getSupabase()

    // Load bucket ONCE at the start
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

    // Load extraction from bucket (should already be populated by background worker)
    let extraction: ExtractionResult = createDefaultExtraction()
    if (bucket.extracted_data) {
        try {
            const parsed = typeof bucket.extracted_data === 'string'
                ? JSON.parse(bucket.extracted_data)
                : bucket.extracted_data
            extraction = { ...extraction, ...parsed }
        } catch (_e) {
            console.log('[StateMachine] Failed to parse extracted_data')
        }
    }

    // Parse media URLs
    const imageUrls: string[] = bucket.image_urls ? JSON.parse(bucket.image_urls) : []
    const audioUrls: string[] = bucket.audio_urls ? JSON.parse(bucket.audio_urls) : []
    let transcripts: string[] = bucket.transcripts ? JSON.parse(bucket.transcripts) : []
    let imageAnalysis = ''

    // Use let so we can update state in the loop without re-reading from DB
    let currentState = bucket.conversation_state || 'initial'
    
    // =========================================================================
    // MULTIMODAL SIGNAL EXTRACTION - Runs ONCE per message (before state loop)
    // =========================================================================

    // Transcribe NEW audio with 15s timeout (only process files not yet transcribed)
    if (audioUrls.length > transcripts.length) {
        const newAudioCount = audioUrls.length - transcripts.length
        console.log(`[StateMachine] Transcribing ${newAudioCount} NEW audio files (${transcripts.length} already done)`)
        for (let i = transcripts.length; i < audioUrls.length; i++) {
            const url = audioUrls[i]
            const transcript = await withTimeout(transcribeAudio(url), 15000, null)
            if (transcript) transcripts.push(transcript)
        }
        // Save transcripts to bucket
        if (transcripts.length > 0) {
            await supabase.from('buckets').update({
                transcripts: JSON.stringify(transcripts)
            }).eq('id', bucketId)
        }
    }

    // Analyze image with 15s timeout (only on first pass when no analysis exists)
    if (imageUrls.length > 0 && currentState === 'initial') {
        console.log(`[StateMachine] Analyzing ${imageUrls.length} images`)
        imageAnalysis = await withTimeout(analyzeImage(imageUrls[0]), 15000, '')
    }

    // Check if user is just confirming (Y/N) - skip full extraction if we already have data
    const lastInput = (bucket.raw_text || '').split('\n').pop()?.toLowerCase().trim() || ''
    const lastTranscript = transcripts.length > 0 ? transcripts[transcripts.length - 1].toLowerCase().trim() : ''
    const userInput = lastTranscript || lastInput
    const isSimpleConfirmation = /^(y|n|yes|no|si|sí|ok|1|2|3|4|5)$/i.test(userInput)
    const hasWorkData = extraction.workType && extraction.hoursWorked && extraction.hoursWorked > 0
    const isConfirmState = ['confirming_project', 'confirming_all', 'selecting_project'].includes(currentState)
    
    // Only run LLM extraction if we need to (not for simple confirmations when we have data)
    if (!(isSimpleConfirmation && hasWorkData && isConfirmState)) {
        console.log(`[StateMachine] Running LLM extraction (isSimple=${isSimpleConfirmation}, hasData=${hasWorkData}, confirmState=${isConfirmState})`)
        
        const llmExtraction = await withTimeout(
            extractWithLLM(
                bucket.raw_text || '',
                transcripts,
                imageAnalysis,
                bucket.ai_response,
                extraction
            ),
            20000,
            null
        )
        if (llmExtraction) {
            let merged = { ...extraction, ...llmExtraction }
            merged = refineExtractionWithRegex(merged, bucket.raw_text || '', transcripts)
            extraction = merged
            
            await supabase.from('buckets').update({
                extracted_data: JSON.stringify(extraction)
            }).eq('id', bucketId)
        }
    } else {
        console.log(`[StateMachine] Skipping extraction - simple confirmation with existing data`)
    }

    // Loop to handle state transitions (max 10 iterations to prevent infinite loops)
    const MAX_ITERATIONS = 10
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        console.log(`[StateMachine] Iteration ${iteration}, state: ${currentState}`)

    // Check for consistency issues (validation)
    if (!extraction.isConsistent && extraction.inconsistencyReason) {
        console.log(`[StateMachine] ⚠️ Inconsistency detected: ${extraction.inconsistencyReason}`)
    }

    // Detect language from extraction or default to member preference
    const language: 'en' | 'es' = extraction.responseLanguage || member?.language_preference || 'en'

    const ctx: StateContext = {
        bucketId,
        bucket,
        member,
        extraction,
        transcripts,
        imageAnalysis,
        language,
    }

    console.log(`[StateMachine] Current state: ${currentState}, language: ${language}, workType: ${extraction.workType}, hours: ${extraction.hoursWorked}`)

    // Route to state handler
    let result: StateResult

    switch (currentState) {
        case 'initial':
            result = await handleInitial(ctx)
            break
        case 'clarifying_inconsistency':
            result = await handleClarifyingInconsistency(ctx)
            break
        case 'collecting_work':
            result = await handleCollectingWork(ctx)
            break
        case 'collecting_hours':
            result = await handleCollectingHours(ctx)
            break
        case 'confirming_all':
            result = await handleConfirmingAll(ctx)
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

        // If transitioning without response, update state and continue loop
        if (!result.response) {
            const transitionUpdate: any = {
                conversation_state: result.nextState,
                extracted_data: result.extraction ? JSON.stringify(result.extraction) : bucket.extracted_data,
            }

            // CRITICAL: Include project_id if set (e.g., from confirming_project → complete)
            if (result.projectId !== undefined) {
                transitionUpdate.project_id = result.projectId
            }

            // CRITICAL: Set status to submitted when transitioning to complete
            if (result.nextState === 'complete') {
                transitionUpdate.status = 'submitted'
            }

            // DEBUG: Log transition update
            console.log(`[StateMachine] 📤 Transition update for bucket #${bucketId}:`, JSON.stringify({
                conversation_state: transitionUpdate.conversation_state,
                status: transitionUpdate.status,
                project_id: transitionUpdate.project_id
            }))

            const { error: transitionError } = await supabase.from('buckets').update(transitionUpdate).eq('id', bucketId)
            if (transitionError) {
                console.error(`[StateMachine] ❌ Transition update failed for bucket #${bucketId}:`, transitionError)
            }

            // Update extraction for next iteration
            if (result.extraction) {
                extraction = result.extraction
            }

            // Update local bucket.project_id so subsequent states see the correct value
            if (result.projectId !== undefined) {
                bucket.project_id = result.projectId
            }

            // Update local state and continue loop (don't re-read from DB!)
            currentState = result.nextState
            continue
        }
    }

    // Save state and send response if any
    const updates: any = {
        extracted_data: result.extraction ? JSON.stringify(result.extraction) : bucket.extracted_data,
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

    // DEBUG: Log what we're updating
    console.log(`[StateMachine] 📝 Updating bucket #${bucketId}:`, JSON.stringify({
        status: updates.status,
        conversation_state: updates.conversation_state,
        hasResponse: !!result.response,
        nextState: result.nextState
    }))

    const { error: updateError } = await supabase.from('buckets').update(updates).eq('id', bucketId)
    if (updateError) {
        console.error(`[StateMachine] ❌ DB update failed for bucket #${bucketId}:`, updateError)
    }

    return {
        status: result.nextState === 'complete' ? 'submitted' : 'open',
        action: result.nextState === 'complete' ? 'success' : 'waiting',
    }
    } // End of for loop

    // Fallback if max iterations reached
    console.error(`[StateMachine] ❌ Max iterations reached for bucket #${bucketId}`)
    return { status: 'error', action: 'max_iterations_reached' }
}

// ============================================================================
// STATE HANDLERS
// ============================================================================

// INITIAL: First message - check what we have and route
function handleInitial(ctx: StateContext): StateResult {
    console.log('[State: Initial]')

    const { extraction, member, bucket } = ctx

    const workType = extraction.workType
    const hoursWorked = extraction.hoursWorked
    const projectHint = extraction.projectHint
    const isConsistent = extraction.isConsistent

    console.log(`[State: Initial] workType=${workType}, hours=${hoursWorked}, projectHint=${projectHint}, consistent=${isConsistent}, isWorkRelated=${extraction.isWorkRelated}`)

    // Check for non-work-related messages FIRST - send helpful fallback response
    if (!extraction.isWorkRelated) {
        console.log('[State: Initial] Message is not work-related, sending fallback response')
        const msg = MESSAGES[ctx.language]
        
        // Detect greeting patterns for a friendlier response
        const rawText = (bucket.raw_text || '').toLowerCase().trim()
        const greetingWords = ['hi', 'hello', 'hey', 'hola', 'buenos', 'buenas', 'good morning', 'good afternoon']
        const isGreeting = greetingWords.some(g => rawText.startsWith(g))
        
        return {
            nextState: 'initial',  // Stay in initial state, waiting for work content
            response: withTicket(ctx.bucketId, isGreeting ? msg.greeting : msg.notWorkRelated),
            extraction,
        }
    }

    // Check for inconsistency - ask for clarification
    if (!isConsistent && extraction.inconsistencyReason) {
        return {
            nextState: 'clarifying_inconsistency',
            response: null,
            extraction,
        }
    }

    // Check what we have
    const hasWork = !!workType
    const hasHours = hoursWorked && hoursWorked > 0
    const hasProject = !!projectHint || !!member?.last_confirmed_project_id
    
    // Check if workType is too vague - if so, ask for clarification
    const vagueWords = ['general', 'work', 'labor', 'job', 'task']
    const isVague = hasWork && vagueWords.some(vw => workType?.toLowerCase().includes(vw))
    const hasUserText = bucket.raw_text && bucket.raw_text.trim().length > 5 // User provided some text
    
    // If workType is vague AND user didn't provide specific text, ask what they worked on
    if (isVague && !hasUserText) {
        console.log(`[State: Initial] Work type "${workType}" is vague, asking for clarification`)
        return {
            nextState: 'collecting_work',
            response: null,
            extraction,
        }
    }

    if (hasWork && hasHours && hasProject) {
        // We have everything! Go to confirming_all
        return {
            nextState: 'confirming_all',
            response: null,
            extraction,
        }
    } else if (hasWork && hasHours) {
        // Have work + hours, need project
        return {
            nextState: 'confirming_project',
            response: null,
            extraction,
        }
    } else if (hasWork && !hasHours) {
        // Have work type (maybe from image), need hours
        return {
            nextState: 'collecting_hours',
            response: null,
            extraction,
        }
    } else {
        // Need everything
        return {
            nextState: 'collecting_work',
            response: null,
            extraction,
        }
    }
}

// CLARIFYING_INCONSISTENCY: Ask user to clarify when image doesn't match text
async function handleClarifyingInconsistency(ctx: StateContext): Promise<StateResult> {
    console.log('[State: ClarifyingInconsistency]')

    const { bucket, extraction, language, member } = ctx
    const stateAttempts = bucket.state_attempts || 0
    const lastMsg = getLastMessage(bucket.raw_text || '')
    const supabase = getSupabase()
    const msg = MESSAGES[language]

    // If this is a response (user clarified)
    if (stateAttempts > 0 && lastMsg) {
        console.log(`[ClarifyingInconsistency] User clarified: "${lastMsg}"`)

        // Re-extract from the clarification text to get correct hours and work type
        const clarifiedExtraction = await withTimeout(
            extractWithLLM(lastMsg, ctx.transcripts || [], ctx.imageAnalysis || '', bucket.ai_response, extraction),
            15000,
            null
        )

        // Use the re-extracted values if available, otherwise keep original
        const updatedExtraction: ExtractionResult = {
            ...extraction,
            workType: clarifiedExtraction?.workType || extraction.workType,
            hoursWorked: clarifiedExtraction?.hoursWorked || extraction.hoursWorked, // Use NEW hours from clarification
            summary: clarifiedExtraction?.summary || extraction.summary,
            materials: clarifiedExtraction?.materials || extraction.materials,
            location: clarifiedExtraction?.location || extraction.location,
            projectHint: clarifiedExtraction?.projectHint || extraction.projectHint,
            isConsistent: true,  // User confirmed, so it's now consistent
            inconsistencyReason: null,
        }

        console.log(`[ClarifyingInconsistency] Updated: workType=${updatedExtraction.workType}, hours=${updatedExtraction.hoursWorked}`)

        // Reset attempts and continue to project confirmation
        await supabase.from('buckets').update({ state_attempts: 0 }).eq('id', ctx.bucketId)

        // Check what we have and route appropriately
        const hasHours = updatedExtraction.hoursWorked && updatedExtraction.hoursWorked > 0
        const hasProject = !!updatedExtraction.projectHint || !!member?.last_confirmed_project_id

        if (hasHours && hasProject) {
            return {
                nextState: 'confirming_all',
                response: null,
                extraction: updatedExtraction,
            }
        } else if (hasHours) {
            return {
                nextState: 'confirming_project',
                response: null,
                extraction: updatedExtraction,
            }
        } else {
            return {
                nextState: 'collecting_hours',
                response: null,
                extraction: updatedExtraction,
            }
        }
    }

    // First time - ask for clarification
    const reason = extraction.inconsistencyReason || 'The information seems inconsistent.'
    
    await supabase.from('buckets').update({ state_attempts: 1 }).eq('id', ctx.bucketId)

    return {
        nextState: 'clarifying_inconsistency',
        response: withDevInfo(ctx.bucketId, msg.clarify(reason), 'clarifying_inconsistency', extraction, 1),
        extraction,
    }
}

// COLLECTING_WORK: Ask for work type and hours
async function handleCollectingWork(ctx: StateContext): Promise<StateResult> {
    console.log('[State: CollectingWork]')

    const { bucket, extraction, language } = ctx
    const stateAttempts = bucket.state_attempts || 0
    const lastMsg = getLastMessage(bucket.raw_text || '')
    const msg = MESSAGES[language]

    // If this is a response (attempts > 0), try to extract
    if (stateAttempts > 0 && lastMsg) {
        // Simple extraction from response
        const hoursMatch = lastMsg.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)?/i)
        const hours = hoursMatch ? parseFloat(hoursMatch[1]) : extraction.hoursWorked
        const workType = lastMsg.replace(/\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)?/gi, '').trim() || extraction.workType || 'work'

        if (hours && hours > 0) {
            return {
                nextState: 'confirming_project',
                response: null,
                extraction: { ...extraction, workType, hoursWorked: hours, summary: lastMsg },
            }
        }
    }

    // Max attempts reached - use defaults
    if (stateAttempts >= 2) {
        return {
            nextState: 'confirming_project',
            response: null,
            extraction: { ...extraction, workType: 'work', hoursWorked: 2, summary: bucket.raw_text },
        }
    }

    // Ask for info
    const supabase = getSupabase()
    await supabase.from('buckets').update({ state_attempts: stateAttempts + 1 }).eq('id', ctx.bucketId)

    // Build context message if we have image analysis or vague work type
    let message = msg.collectWork
    if (ctx.imageAnalysis && extraction.workType) {
        message = `I see ${extraction.workType} work. What exactly did you work on, and how many hours?`
    }

    return {
        nextState: 'collecting_work',
        response: withDevInfo(ctx.bucketId, message, 'collecting_work', extraction, stateAttempts + 1),
        extraction,
    }
}

// COLLECTING_HOURS: We have work type (from image), just need hours
async function handleCollectingHours(ctx: StateContext): Promise<StateResult> {
    console.log('[State: CollectingHours]')

    const { bucket, extraction, language } = ctx
    const stateAttempts = bucket.state_attempts || 0
    const lastMsg = getLastMessage(bucket.raw_text || '')
    const msg = MESSAGES[language]

    // If this is a response, try to extract hours
    if (stateAttempts > 0 && lastMsg) {
        const hoursMatch = lastMsg.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|horas?)?/i)
        const hours = hoursMatch ? parseFloat(hoursMatch[1]) : null

        if (hours && hours > 0) {
            return {
                nextState: 'confirming_project',
                response: null,
                extraction: { ...extraction, hoursWorked: hours },
            }
        }
    }

    // Max attempts - use default 2 hours
    if (stateAttempts >= 2) {
        return {
            nextState: 'confirming_project',
            response: null,
            extraction: { ...extraction, hoursWorked: 2 },
        }
    }

    // Ask for hours
    const supabase = getSupabase()
    await supabase.from('buckets').update({ state_attempts: stateAttempts + 1 }).eq('id', ctx.bucketId)

    const wt = extraction.workType || 'work'
    return {
        nextState: 'collecting_hours',
        response: withDevInfo(ctx.bucketId, msg.askHours(wt), 'collecting_hours', extraction, stateAttempts + 1),
        extraction,
    }
}

// CONFIRMING_ALL: We have everything - confirm all at once
async function handleConfirmingAll(ctx: StateContext): Promise<StateResult> {
    console.log('[State: ConfirmingAll]')

    const { bucket, member, extraction, language, transcripts } = ctx
    const stateAttempts = bucket.state_attempts || 0
    // Use multimodal input: check BOTH text and transcripts for confirmation
    const lastMsg = getLastUserInput(bucket.raw_text || '', transcripts)
    const supabase = getSupabase()
    const msg = MESSAGES[language]

    // Get project info - use projectHint or member's last project
    let projectId: number | null = null
    let projectName = ''

    // Try to match projectHint to a real project
    if (extraction.projectHint && extraction.projectHint !== 'CONFIRMED') {
        const { data: matched } = await supabase
            .from('projects')
            .select('id, name')
            .eq('node_id', bucket.node_id)
            .ilike('name', `%${extraction.projectHint}%`)
            .limit(1)
            .single()
        
        if (matched) {
            projectId = matched.id
            projectName = matched.name
        }
    }

    // Fall back to member's last confirmed project
    if (!projectId && member?.last_confirmed_project_id) {
        projectId = member.last_confirmed_project_id
        const { data: proj } = await supabase
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .single()
        projectName = proj?.name || 'your project'
    }

    // If this is a response
    if (stateAttempts > 0) {
        const firstWord = lastMsg.split(/[\s.,!]/)[0].toLowerCase()
        const yesWords = ['yes', 'y', 'si', 'sí', 's', 'ok', 'yeah', 'yep', 'correct', 'correcto']
        const saidYes = yesWords.includes(firstWord) || yesWords.some(w => lastMsg === w)

        if (saidYes && projectId) {
            // Check if user added more details after "yes"
            let updatedExtraction = extraction
            
            // Capture anything after the confirmation word
            const confirmationPattern = /^(?:yes|y|si|sí|s|ok|yeah|yep|correct|correcto)[\s.,!]*(.*)/i
            const match = lastMsg.match(confirmationPattern)
            
            if (match && match[1] && match[1].trim().length > 0) {
                const additionalText = match[1].trim()
                console.log(`[ConfirmingAll] User added text: "${additionalText}"`)
                
                // Run LLM with existing extraction context - it will intelligently merge
                const additionalExtraction = await withTimeout(
                    extractWithLLM(additionalText, [], '', bucket.ai_response, extraction),
                    15000,
                    null
                )
                
                if (additionalExtraction && additionalExtraction.hoursWorked) {
                    // Add the hours together
                    const totalHours = (extraction.hoursWorked || 0) + additionalExtraction.hoursWorked
                    console.log(`[ConfirmingAll] Adding ${additionalExtraction.hoursWorked}h to existing ${extraction.hoursWorked}h = ${totalHours}h`)
                    
                    // Combine work types if different
                    let combinedWorkType = extraction.workType || ''
                    if (additionalExtraction.workType && additionalExtraction.workType !== extraction.workType) {
                        combinedWorkType = combinedWorkType 
                            ? `${combinedWorkType}, ${additionalExtraction.workType}` 
                            : additionalExtraction.workType
                    }
                    
                    // Combine summaries
                    const currentSummary = extraction.summary || extraction.workType || ''
                    const additionalSummary = additionalExtraction.summary || additionalExtraction.workType || additionalText
                    const combinedSummary = currentSummary 
                        ? `${currentSummary}. ${additionalSummary}` 
                        : additionalSummary
                    
                    updatedExtraction = {
                        ...extraction,
                        hoursWorked: totalHours,
                        workType: combinedWorkType || extraction.workType,
                        summary: combinedSummary
                    }
                } else {
                    // No additional hours found, just append to summary
                    const currentSummary = extraction.summary || extraction.workType || ''
                    updatedExtraction = {
                        ...extraction,
                        summary: currentSummary ? `${currentSummary}. ${additionalText}` : additionalText
                    }
                }
            }

            // Confirmed! Complete
            await supabase.from('buckets').update({ state_attempts: 0 }).eq('id', ctx.bucketId)
            await supabase.from('members').update({
                last_confirmed_project_id: projectId,
                project_confirmed_at: new Date().toISOString(),
            }).eq('id', member.id)

            return {
                nextState: 'complete',
                response: null,
                extraction: updatedExtraction,
                projectId,
            }
        } else {
            // User said no or provided correction - go to selecting project
            await supabase.from('buckets').update({ state_attempts: 0 }).eq('id', ctx.bucketId)
            return {
                nextState: 'selecting_project',
                response: null,
                extraction,
            }
        }
    }

    // First time - ask for confirmation of everything
    if (!projectId) {
        // No project found - go to selecting
        return {
            nextState: 'selecting_project',
            response: null,
            extraction,
        }
    }

    const wt = extraction.workType || 'work'
    const h = extraction.hoursWorked || 0

    await supabase.from('buckets').update({ state_attempts: 1 }).eq('id', ctx.bucketId)

    return {
        nextState: 'confirming_all',
        response: withDevInfo(ctx.bucketId, msg.confirmAll(wt, h, projectName), 'confirming_all', extraction, 1),
        extraction,
    }
}

// CONFIRMING_PROJECT: "At X project? (Y/N)"
async function handleConfirmingProject(ctx: StateContext): Promise<StateResult> {
    console.log('[State: ConfirmingProject]')

    const { bucket, member, extraction, language, transcripts } = ctx
    const stateAttempts = bucket.state_attempts || 0
    // Use multimodal input: check BOTH text and transcripts for Y/N response
    const lastMsg = getLastUserInput(bucket.raw_text || '', transcripts)
    const supabase = getSupabase()
    const msg = MESSAGES[language]

    // Get member's last confirmed project (always, for Y/N response handling)
    const memberProjectId: number | null = member?.last_confirmed_project_id || null
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
        response: withDevInfo(ctx.bucketId, msg.confirmProject(wt, h, memberProjectName), 'confirming_project', extraction, 1),
        extraction,
    }
}

// SELECTING_PROJECT: Show numbered list
async function handleSelectingProject(ctx: StateContext): Promise<StateResult> {
    console.log('[State: SelectingProject]')

    const { bucket, member, extraction, language, transcripts } = ctx
    const stateAttempts = bucket.state_attempts || 0
    // Use multimodal input: check BOTH text and transcripts for number selection
    const lastMsg = getLastUserInput(bucket.raw_text || '', transcripts)
    const supabase = getSupabase()
    const msg = MESSAGES[language]

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
    const projectList = projects?.map((p, i) => `${i + 1}. ${p.name}`).join('\n') || msg.noProjects
    const projectCount = projects?.length || 0

    await supabase.from('buckets').update({ state_attempts: stateAttempts + 1 }).eq('id', ctx.bucketId)

    return {
        nextState: 'selecting_project',
        response: withDevInfo(ctx.bucketId, msg.selectProject(wt, h, projectList, projectCount), 'selecting_project', extraction, stateAttempts + 1),
        extraction,
    }
}

// COMPLETE: Create transaction and send confirmation
async function handleComplete(ctx: StateContext): Promise<StateResult> {
    console.log('[State: Complete]')

    const { bucket, extraction, language } = ctx
    const supabase = getSupabase()
    const msg = MESSAGES[language]

    // Get project name
    let projectName = 'Inbox'
    if (bucket.project_id) {
        const { data: proj } = await supabase.from('projects').select('name').eq('id', bucket.project_id).single()
        projectName = proj?.name || 'Inbox'
    }

    // Update bucket with AI summary and hours before completing
    const updateData: any = {}
    if (extraction.summary) updateData.summary = extraction.summary
    if (extraction.hoursWorked !== null && extraction.hoursWorked !== undefined) {
        updateData.hours = extraction.hoursWorked
    }
    
    if (Object.keys(updateData).length > 0) {
        await supabase.from('buckets').update(updateData).eq('id', ctx.bucketId)
    }

    // Create transaction (using correct schema columns)
    // Use bucket.hours if available (allows editing), fallback to extraction
    const finalHours = bucket.hours ?? extraction.hoursWorked ?? null
    
    const txn = {
        bucket_id: ctx.bucketId,
        company_id: bucket.node_id,
        user_id: bucket.member_id,
        project_id: bucket.project_id,
        job: `${extraction.workType || 'work'} - ${finalHours || 0}h`,
        scope_description: extraction.summary || extraction.workType,
        labor: extraction.summary || `${extraction.workType || 'work'} for ${finalHours || 0}h`,
        material: extraction.materials?.join(', ') || null,
        location: extraction.location || null,
        time: finalHours,  // Use final hours value
        potential_change: bucket.potential_change || false,  // ← PROPAGATE FLAG
        status: 'COMPLETED',
    }

    const { error } = await supabase.from('txns').insert(txn)
    if (error) console.error('[State: Complete] Error creating txn:', error)

    const wt = extraction.workType || 'work'
    const h = extraction.hoursWorked || 0
    const materials = extraction.materials?.join(', ') || undefined
    const location = extraction.location || undefined
    const confirmMsg = withDevInfo(
        ctx.bucketId, 
        msg.success(wt, h, projectName, materials, location, extraction.summary || undefined), 
        'complete', 
        extraction, 
        0
    )

    return {
        nextState: 'complete',
        response: confirmMsg,
        extraction,
    }
}
