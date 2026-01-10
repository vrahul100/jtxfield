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

    // Check consistency
    if (!extraction.isConsistent && extraction.inconsistencyReason) {
        console.log(`[Node: Validate] Inconsistency: ${extraction.inconsistencyReason}`)
        return {
            validation: {
                isValid: false,
                missingFields: [],
                invalidFields: [],
                inconsistencyReason: extraction.inconsistencyReason,
            }
        }
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

    // CASE 1: Inconsistency detected
    if (validation.inconsistencyReason) {
        if (attempts < 2) {
            const question = `⚠️ ${validation.inconsistencyReason}\nCan you clarify?`
            await sendWhatsAppMessage(bucket.from_phone, question, bucket.source)
            await supabase.from('buckets').update({
                status: 'open',
                ai_response: question,
                validation_attempts: attempts + 1,
            }).eq('id', state.bucketId)

            return { status: 'open', action: 'ask_clarification', response: question }
        } else {
            const msg = '📋 Flagged for boss to check. I\'ve saved the data.'
            await sendWhatsAppMessage(bucket.from_phone, msg, bucket.source)
            await supabase.from('buckets').update({ status: 'flagged' }).eq('id', state.bucketId)

            return { status: 'flagged', action: 'flagged', response: msg }
        }
    }

    // CASE 2: Missing fields
    if (validation.missingFields.length > 0) {
        if (attempts < 3) {
            const field = validation.missingFields[0]
            const question = FIELD_QUESTIONS[field] || `What is the ${field}?`
            await sendWhatsAppMessage(bucket.from_phone, question, bucket.source)
            await supabase.from('buckets').update({
                status: 'open',
                ai_response: question,
                validation_attempts: attempts + 1,
            }).eq('id', state.bucketId)

            return { status: 'open', action: 'ask_missing', response: question }
        } else {
            const msg = '📋 Saved with blanks. We can fix it later.'
            await sendWhatsAppMessage(bucket.from_phone, msg, bucket.source)
            await supabase.from('buckets').update({ status: 'pending_review' }).eq('id', state.bucketId)

            return { status: 'pending_review', action: 'flagged', response: msg }
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

        const confirmMsg = `✅ Logged: ${extraction.workType} for ${extraction.hoursWorked}h. Done!`
        await sendWhatsAppMessage(bucket.from_phone, confirmMsg, bucket.source)

        return { status: 'submitted', action: 'success', response: confirmMsg }
    }

    return { status: 'pending_review', action: 'error' }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildExtractionPrompt(transcript: string, imageAnalysis: string): string {
    return `You are a construction foreman. Extract work log data from user input.

**USER INPUT:** (What the user typed or said)
${transcript || '[NO TEXT - user only sent an image]'}

**IMAGE ANALYSIS:** (What the photos show)
${imageAnalysis || 'No images'}

---

## CRITICAL RULES - READ CAREFULLY:

1. **NEVER HALLUCINATE OR MAKE UP DATA!** If the user did NOT explicitly state something, return null.
2. For hoursWorked: ONLY return a number if the user explicitly mentioned hours/time. Otherwise return null.
3. For workType: Use image analysis ONLY if user didn't state it. If user stated something different, set isConsistent=false.
4. For summary: If user input is empty, describe what you see in the image.

## EXAMPLES:
- User sends image only (no text) → hoursWorked: null (NOT 3 or any made up number!)
- User says "electrical work" but image shows rebar → isConsistent: false
- User says "worked on site" (no hours) → hoursWorked: null

---

**TASK:** Extract:
1. workType: Type of work from user text OR image if no text. "electrical" | "plumbing" | "hvac" | "carpentry" | "masonry" | "painting" | "rebar" | "concrete" | "general"
2. hoursWorked: ONLY if user explicitly stated hours. Otherwise NULL.
3. summary: Brief description from user text or image
4. materials: Materials mentioned or visible (as array)
5. location: Location if mentioned, else null
6. isConsistent: true if user text matches image (or if no text)
7. inconsistencyReason: Only if text contradicts image

Return JSON only. DO NOT INVENT DATA!`
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
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
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
