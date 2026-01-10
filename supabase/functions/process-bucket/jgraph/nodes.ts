// jField Node Implementations for Adaptive Brain
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

    console.log(`[Node: LoadContext] Loaded: ${imageUrls.length} images, ${audioUrls.length} audio`)

    return {
        bucket: bucket as Bucket,
        member: bucket.members as Member,
        rawText: bucket.raw_text || '',
        imageUrls,
        audioUrls,
        transcripts,
        attempts: bucket.validation_attempts || 0,
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

    const prompt = buildExtractionPrompt(allText, state.imageAnalysis)

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
            return { status: 'pending_review', action: 'error' }
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content
        const extraction = JSON.parse(content) as ExtractionResult

        console.log(`[Node: ExtractData] Extracted:`, {
            workType: extraction.workType,
            hours: extraction.hoursWorked,
            consistent: extraction.isConsistent,
        })

        return { extraction }
    } catch (e) {
        console.error(`[Node: ExtractData] Error:`, e)
        return { status: 'pending_review', action: 'error' }
    }
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

    // Check consistency (but ignore if it's a system error, not user error)
    const isSystemError = extraction.inconsistencyReason?.toLowerCase().includes('could not be loaded') ||
        extraction.inconsistencyReason?.toLowerCase().includes('image analysis') ||
        extraction.inconsistencyReason?.toLowerCase().includes('unavailable') ||
        extraction.inconsistencyReason?.toLowerCase().includes('failed')

    if (!extraction.isConsistent && extraction.inconsistencyReason && !isSystemError) {
        console.log(`[Node: Validate] Inconsistency: ${extraction.inconsistencyReason}`)
        return {
            validation: {
                isValid: false,
                missingFields: [],
                invalidFields: [],
                inconsistencyReason: extraction.inconsistencyReason,
            }
        }
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

    // Get language from LLM extraction (defaults to English)
    const lang = extraction?.responseLanguage || 'en'
    const ticketId = state.bucketId

    // LLM-based bilingual messages (include ticket # for context)
    const msgs = lang === 'es' ? {
        clarify: '¿Puedes aclarar?',
        flagged: `📋 Ticket #${ticketId} marcado para revisión. He guardado los datos.`,
        savedBlanks: `📋 Ticket #${ticketId} guardado con datos incompletos. Lo arreglaremos después.`,
        success: (wt: string, h: number) => `✅ Ticket #${ticketId} registrado: ${wt} por ${h}h. ¡Listo!`,
        askWorkType: `🔧 Ticket #${ticketId}: ¿Qué tipo de trabajo hiciste? (eléctrico, plomería, carpintería, etc.)`,
        askHours: `⏱️ Ticket #${ticketId}: ¿Cuántas horas trabajaste?`,
        askSummary: `📝 Ticket #${ticketId}: ¿Puedes describir brevemente lo que hiciste?`,
    } : {
        clarify: 'Can you clarify?',
        flagged: `📋 Ticket #${ticketId} flagged for boss to check. I've saved the data.`,
        savedBlanks: `📋 Ticket #${ticketId} saved with blanks. We can fix it later.`,
        success: (wt: string, h: number) => `✅ Ticket #${ticketId} logged: ${wt} for ${h}h. Done!`,
        askWorkType: `🔧 Ticket #${ticketId}: What type of work did you do? (electrical, plumbing, carpentry, etc.)`,
        askHours: `⏱️ Ticket #${ticketId}: How many hours did you work?`,
        askSummary: `📝 Ticket #${ticketId}: Can you briefly describe what you did?`,
    }

    // Map field names to questions
    const fieldQuestions: Record<string, string> = {
        workType: msgs.askWorkType,
        hoursWorked: msgs.askHours,
        summary: msgs.askSummary,
    }

    // CASE 1: Inconsistency detected
    if (validation.inconsistencyReason) {
        if (attempts < 2) {
            // Use the inconsistencyReason from LLM (already in user's language)
            const question = `⚠️ Ticket #${ticketId}: ${validation.inconsistencyReason}\n${msgs.clarify}`
            await sendWhatsAppMessage(bucket.from_phone, question, bucket.source)
            await supabase.from('buckets').update({
                status: 'open',
                ai_response: question,
                validation_attempts: attempts + 1,
            }).eq('id', state.bucketId)

            return { status: 'open', action: 'ask_clarification', response: question }
        } else {
            await sendWhatsAppMessage(bucket.from_phone, msgs.flagged, bucket.source)
            await supabase.from('buckets').update({ status: 'flagged' }).eq('id', state.bucketId)

            return { status: 'flagged', action: 'flagged', response: msgs.flagged }
        }
    }

    // CASE 2: Missing fields
    if (validation.missingFields.length > 0) {
        if (attempts < 3) {
            const field = validation.missingFields[0]
            const question = fieldQuestions[field] || `What is the ${field}?`
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
        const txn = {
            bucket_id: state.bucketId,
            company_id: bucket.node_id,
            user_id: bucket.member_id,
            project_id: bucket.project_id,
            job: extraction.summary,
            time: extraction.hoursWorked,
            labor: state.rawText,
            material: Array.isArray(extraction.materials) ? extraction.materials.join(', ') : null,
            evidence: state.imageUrls.length > 0 ? JSON.stringify(state.imageUrls) : null,
            scope_description: extraction.summary,
            status: 'COMPLETED',
        }

        await supabase.from('txns').insert(txn)
        await supabase.from('buckets').update({ status: 'submitted' }).eq('id', state.bucketId)

        const confirmMsg = msgs.success(extraction.workType || 'work', extraction.hoursWorked || 0)
        await sendWhatsAppMessage(bucket.from_phone, confirmMsg, bucket.source)

        return { status: 'submitted', action: 'success', response: confirmMsg }
    }

    return { status: 'pending_review', action: 'error' }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildExtractionPrompt(transcript: string, imageAnalysis: string): string {
    return `You are a construction foreman. Extract work log data and respond in the SAME LANGUAGE as the user.

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

## RULES:
1. **NEVER HALLUCINATE!** If hours not stated, hoursWorked = null
2. Extract workType from USER's FINAL statement (after any corrections)
3. Compare FINAL workType against image - set isConsistent accordingly
4. **responseLanguage**: Set to "es" if user writes in Spanish, "en" otherwise

## WORK TYPES:
"electrical" | "plumbing" | "hvac" | "carpentry" | "masonry" | "painting" | "rebar" | "concrete" | "general"

---

**EXTRACT (JSON only):**
1. workType: The FINAL/CORRECTED work type from user
2. hoursWorked: ONLY if user explicitly stated. Otherwise NULL.
3. summary: Brief description
4. materials: Materials visible/mentioned (array)
5. location: If stated, else null
6. isConsistent: TRUE if FINAL work type matches image
7. inconsistencyReason: Only if FINAL type doesn't match image (write in user's language!)
8. responseLanguage: "es" if Spanish, "en" otherwise

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
