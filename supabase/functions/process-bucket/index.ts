// Supabase Edge Function: process-bucket
// ADAPTIVE BRAIN - "Commit First, Process Async"
// Senses (Preprocessing) → Intelligence (Extraction) → Judge (Validation)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// Schema: Required Fields
// ============================================================================

const REQUIRED_FIELDS = ['workType', 'hoursWorked']

const FIELD_QUESTIONS: Record<string, string> = {
    workType: 'What type of work did you do?',
    hoursWorked: 'How many hours did this take?',
}

// ============================================================================
// AI Prompts
// ============================================================================

const IMAGE_ANALYSIS_PROMPT = `Describe this construction/work image in detail.
List visible:
- Type of work (electrical, plumbing, carpentry, etc.)
- Materials visible
- Completion status (in progress, completed, starting)
- Any notable details

Be concise but specific.`

const EXTRACTION_PROMPT = `You are a construction foreman. Extract work log data from a CONVERSATION.

**TRANSCRIPT:** (Full conversation - initial message + any Q&A corrections)
{TRANSCRIPT}

**IMAGE ANALYSIS:** (What the photos show)
{IMAGE_ANALYSIS}

---

## CONVERSATION FORMAT
The transcript may contain a multi-turn conversation:
- Initial message: "elec work for 3 hours" 
---
Q: Bot asked for clarification
A: User's correction: "oh yes. rebar work"

## CRITICAL: USE THE USER'S FINAL/CORRECTED STATEMENT

If user initially said "electrical" but then corrected to "rebar", use "rebar".
Phrases like "oh yes", "yes", "right", "correct", "actually", "sorry" followed by a work type = CORRECTION.

**After a correction, the statement IS CONSISTENT if it now matches the image.**

---

**TASK:** Extract FROM THE USER'S FINAL STATEMENT:
1. workType: The FINAL work type user stated. "electrical" | "plumbing" | "hvac" | "carpentry" | "masonry" | "painting" | "rebar" | "concrete" | "general"
2. hoursWorked: Hours from user's statement. Null if not stated.
3. summary: Brief summary of FINAL corrected work
4. materials: Materials from text or image
5. location: Specific location if mentioned
6. isConsistent: true if user's FINAL statement matches image. false ONLY if final statement still contradicts.
7. inconsistencyReason: Only if FINAL statement contradicts image

**EXAMPLES:**
- User: "electrical work" → Corrects to: "oh yes rebar" → Image: rebar → workType="rebar", isConsistent=TRUE
- User: "electrical work" → No correction → Image: rebar → workType="electrical", isConsistent=FALSE

Return JSON only:`

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { bucketId } = await req.json()
        if (!bucketId) {
            return new Response(JSON.stringify({ error: 'bucketId required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        console.log(`[Brain] 🧠 Processing bucket #${bucketId}`)

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const groqApiKey = Deno.env.get('GROQ_API_KEY')
        const supabase = createClient(supabaseUrl, supabaseKey)

        // ===================================================================
        // STEP 1: CONTEXT LOADING
        // ===================================================================

        const { data: bucket, error: fetchError } = await supabase
            .from('buckets')
            .select('*, members(*)')
            .eq('id', bucketId)
            .single()

        if (fetchError || !bucket) {
            console.error(`[Brain] Bucket not found:`, fetchError)
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // IDEMPOTENCY CHECK: Skip if already processing or completed
        const skipStatuses = ['processing', 'submitted', 'flagged', 'pending_review']
        if (skipStatuses.includes(bucket.status)) {
            console.log(`[Brain] ⏭️ Skipping bucket #${bucketId} - already ${bucket.status}`)
            return new Response(JSON.stringify({
                success: true,
                action: 'skipped',
                reason: `Already ${bucket.status}`
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Update status to processing (atomic lock)
        const { error: lockError } = await supabase
            .from('buckets')
            .update({ status: 'processing' })
            .eq('id', bucketId)
            .eq('status', bucket.status) // Only update if status hasn't changed

        if (lockError) {
            console.log(`[Brain] ⏭️ Failed to acquire lock for bucket #${bucketId}`)
            return new Response(JSON.stringify({ success: true, action: 'lock_failed' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const imageUrls: string[] = bucket.image_urls ? JSON.parse(bucket.image_urls) : []
        const audioUrls: string[] = bucket.audio_urls ? JSON.parse(bucket.audio_urls) : []
        let transcripts: string[] = bucket.transcripts ? JSON.parse(bucket.transcripts) : []
        const currentAttempts = bucket.validation_attempts || 0

        console.log(`[Brain] Bucket has: ${imageUrls.length} images, ${audioUrls.length} audio, text: "${bucket.raw_text?.slice(0, 50) || 'none'}"`)

        // ===================================================================
        // STEP 2: THE SENSES (Preprocessing)
        // ===================================================================

        // 2A. TRANSCRIBE AUDIO
        if (groqApiKey && audioUrls.length > 0 && transcripts.length === 0) {
            console.log(`[Brain] 🎙️ Transcribing ${audioUrls.length} audio file(s)`)
            for (const url of audioUrls) {
                const transcript = await transcribeAudio(url, groqApiKey)
                if (transcript) {
                    transcripts.push(transcript)
                    console.log(`[Brain] Transcript: "${transcript}"`)
                }
            }
            await supabase.from('buckets').update({
                transcripts: JSON.stringify(transcripts)
            }).eq('id', bucketId)
        }

        // 2B. ANALYZE IMAGES
        let imageAnalysis = ''
        if (groqApiKey && imageUrls.length > 0) {
            console.log(`[Brain] 📸 Analyzing ${imageUrls.length} image(s)`)
            imageAnalysis = await analyzeImage(imageUrls[0], groqApiKey)
            console.log(`[Brain] Image analysis: "${imageAnalysis.slice(0, 100)}..."`)
        }

        // ===================================================================
        // STEP 3: THE INTELLIGENCE (Extraction)
        // ===================================================================

        if (!groqApiKey) {
            console.log(`[Brain] No GROQ_API_KEY, marking for review`)
            await supabase.from('buckets').update({ status: 'pending_review' }).eq('id', bucketId)
            await sendTwilioMessage(bucket.from_phone, '📋 Saved for review.', bucket.source)
            return new Response(JSON.stringify({ success: true, action: 'no_ai' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Build transcript for LLM
        let fullTranscript = bucket.raw_text || ''
        if (transcripts.length > 0) {
            fullTranscript += '\n[Voice]: ' + transcripts.join('\n[Voice]: ')
        }

        const extraction = await extractData(fullTranscript, imageAnalysis, groqApiKey)
        console.log(`[Brain] Extraction:`, JSON.stringify(extraction, null, 2))

        // Save extraction
        await supabase.from('buckets').update({
            extracted_data: extraction,
            summary: extraction.summary,
            clarity_score: extraction.isConsistent ? 0.9 : 0.3,
        }).eq('id', bucketId)

        // ===================================================================
        // STEP 4: THE JUDGE (Validation)
        // ===================================================================

        // Rule 1: Consistency Check
        if (extraction.isConsistent === false && extraction.inconsistencyReason) {
            return await handleInconsistency(
                supabase, bucket, bucketId, currentAttempts,
                extraction.inconsistencyReason
            )
        }

        // Rule 2: Missing Fields Check
        const missingFields: string[] = []
        for (const field of REQUIRED_FIELDS) {
            const value = extraction[field]
            const isEmpty = value === undefined || value === null || value === '' ||
                (field === 'hoursWorked' && (typeof value !== 'number' || value <= 0))
            if (isEmpty) {
                missingFields.push(field)
            }
        }

        console.log(`[Brain] Missing fields: ${missingFields.length > 0 ? missingFields.join(', ') : 'NONE'}`)

        if (missingFields.length > 0) {
            return await handleMissingData(
                supabase, bucket, bucketId, currentAttempts,
                missingFields
            )
        }

        // Rule 3: Data Validity
        if (typeof extraction.hoursWorked === 'number' && extraction.hoursWorked > 24) {
            return await handleMissingData(
                supabase, bucket, bucketId, currentAttempts,
                ['hoursWorked'] // Treat as invalid
            )
        }

        // ===================================================================
        // STRATEGY A: SUCCESS
        // ===================================================================

        console.log(`[Brain] ✅ All validations passed!`)

        // Create transaction
        const txnData = {
            bucket_id: bucketId,
            company_id: bucket.node_id,
            user_id: bucket.member_id,
            project_id: bucket.project_id,
            job: extraction.summary,
            time: extraction.hoursWorked,
            labor: bucket.raw_text,
            material: Array.isArray(extraction.materials) ? extraction.materials.join(', ') : null,
            evidence: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
            scope_description: extraction.summary,
            status: 'COMPLETED',
        }

        const { error: txnError } = await supabase.from('txns').insert(txnData)
        if (txnError) {
            console.error(`[Brain] Transaction error:`, txnError)
        }

        // Update bucket status
        await supabase.from('buckets').update({ status: 'submitted' }).eq('id', bucketId)

        // Send success message
        const successMsg = `✅ Logged: ${extraction.workType || 'work'} for ${extraction.hoursWorked}h. Done!`
        await sendTwilioMessage(bucket.from_phone, successMsg, bucket.source)

        console.log(`[Brain] ✅ Bucket #${bucketId} complete`)

        return new Response(JSON.stringify({ success: true, action: 'completed', extraction }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: unknown) {
        console.error('[Brain] Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})

// ============================================================================
// STRATEGY B: Handle Inconsistency
// ============================================================================

async function handleInconsistency(
    supabase: any,
    bucket: any,
    bucketId: number,
    attempts: number,
    reason: string
): Promise<Response> {
    console.log(`[Brain] ⚠️ Inconsistency detected (attempt ${attempts + 1})`)

    if (attempts < 2) {
        // Ask for clarification
        const question = `⚠️ ${reason}\nCan you clarify?`
        await sendTwilioMessage(bucket.from_phone, question, bucket.source)

        await supabase.from('buckets').update({
            status: 'open',
            ai_response: question,
            validation_attempts: attempts + 1,
        }).eq('id', bucketId)

        return new Response(JSON.stringify({ success: true, action: 'asked_clarification' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } else {
        // Give up, flag for review
        await supabase.from('buckets').update({ status: 'flagged' }).eq('id', bucketId)

        const msg = `📋 Flagged for boss to check. I've saved the data.`
        await sendTwilioMessage(bucket.from_phone, msg, bucket.source)

        return new Response(JSON.stringify({ success: true, action: 'flagged' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
}

// ============================================================================
// STRATEGY C: Handle Missing Data
// ============================================================================

async function handleMissingData(
    supabase: any,
    bucket: any,
    bucketId: number,
    attempts: number,
    missingFields: string[]
): Promise<Response> {
    console.log(`[Brain] ❓ Missing data (attempt ${attempts + 1}): ${missingFields.join(', ')}`)

    if (attempts < 3) {
        // Ask for first missing field
        const field = missingFields[0]
        const question = FIELD_QUESTIONS[field] || `What is the ${field}?`

        await sendTwilioMessage(bucket.from_phone, question, bucket.source)

        await supabase.from('buckets').update({
            status: 'open',
            ai_response: question,
            validation_attempts: attempts + 1,
        }).eq('id', bucketId)

        return new Response(JSON.stringify({ success: true, action: 'asked_question', missing: missingFields }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } else {
        // Give up, save partial
        await supabase.from('buckets').update({ status: 'pending_review' }).eq('id', bucketId)

        const msg = `📋 Saved with blanks. We can fix it later.`
        await sendTwilioMessage(bucket.from_phone, msg, bucket.source)

        return new Response(JSON.stringify({ success: true, action: 'pending_review' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
}

// ============================================================================
// AI: Image Analysis
// ============================================================================

async function analyzeImage(imageUrl: string, groqApiKey: string): Promise<string> {
    try {
        // Resolve Twilio media URL to base64 data URL
        console.log(`[Vision] Fetching image from: ${imageUrl}`)
        const imageDataUrl = await resolveImageToBase64(imageUrl)
        if (!imageDataUrl) {
            console.error(`[Vision] Failed to resolve image URL`)
            return 'Image could not be loaded'
        }
        console.log(`[Vision] Image resolved, sending to Groq...`)

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    { role: 'system', content: IMAGE_ANALYSIS_PROMPT },
                    {
                        role: 'user', content: [
                            { type: 'text', text: 'Analyze this work photo:' },
                            { type: 'image_url', image_url: { url: imageDataUrl } }
                        ]
                    }
                ],
                temperature: 0.1,
                max_tokens: 500,
            }),
        })

        if (!response.ok) {
            const err = await response.text()
            console.error(`[Vision] Error: ${response.status} - ${err}`)
            return 'Image analysis unavailable'
        }

        const data = await response.json()
        const analysis = data.choices?.[0]?.message?.content || 'No analysis'
        console.log(`[Vision] Analysis: "${analysis.slice(0, 200)}..."`)
        return analysis
    } catch (e) {
        console.error('[Vision] Failed:', e)
        return 'Image analysis failed'
    }
}

// Fetch image and convert to base64 data URL
async function resolveImageToBase64(url: string): Promise<string | null> {
    try {
        // Twilio media URLs require Basic Auth
        const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
        const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN') || ''

        const headers: Record<string, string> = {}
        if (twilioSid && twilioAuth && url.includes('twilio.com')) {
            const auth = btoa(`${twilioSid}:${twilioAuth}`)
            headers['Authorization'] = `Basic ${auth}`
        }

        console.log(`[Image] Fetching: ${url.slice(0, 80)}...`)
        const resp = await fetch(url, { redirect: 'follow', headers })

        if (!resp.ok) {
            console.error(`[Image] Fetch failed: ${resp.status}`)
            return null
        }

        const contentType = resp.headers.get('content-type') || 'image/jpeg'
        const arrayBuffer = await resp.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

        console.log(`[Image] Resolved successfully (${arrayBuffer.byteLength} bytes)`)
        return `data:${contentType};base64,${base64}`
    } catch (e) {
        console.error('[Image] Resolution failed:', e)
        return null
    }
}

// ============================================================================
// AI: Data Extraction
// ============================================================================

interface ExtractionResult {
    workType?: string
    hoursWorked?: number
    summary: string
    materials?: string[]
    location?: string
    isConsistent: boolean
    inconsistencyReason?: string
    [key: string]: unknown
}

async function extractData(
    transcript: string,
    imageAnalysis: string,
    groqApiKey: string
): Promise<ExtractionResult> {
    try {
        const prompt = EXTRACTION_PROMPT
            .replace('{TRANSCRIPT}', transcript || '(No text provided)')
            .replace('{IMAGE_ANALYSIS}', imageAnalysis || '(No images)')

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            }),
        })

        if (!response.ok) {
            const err = await response.text()
            console.error(`[Extraction] Error: ${response.status} - ${err}`)
            throw new Error(`Extraction failed: ${response.status}`)
        }

        const data = await response.json()
        const raw = data.choices?.[0]?.message?.content || '{}'

        let parsed: Record<string, unknown>
        try {
            parsed = JSON.parse(raw)
        } catch {
            parsed = {}
        }

        return {
            workType: parsed.workType as string | undefined,
            hoursWorked: parsed.hoursWorked as number | undefined,
            summary: (parsed.summary as string) || transcript.slice(0, 100),
            materials: parsed.materials as string[] | undefined,
            location: parsed.location as string | undefined,
            isConsistent: parsed.isConsistent !== false,
            inconsistencyReason: parsed.inconsistencyReason as string | undefined,
        }
    } catch (e) {
        console.error('[Extraction] Failed:', e)
        return {
            summary: transcript.slice(0, 100),
            isConsistent: true,
        }
    }
}

// ============================================================================
// Audio Transcription
// ============================================================================

async function transcribeAudio(audioUrl: string, groqApiKey: string): Promise<string> {
    try {
        console.log(`[Whisper] Transcribing: ${audioUrl}`)
        const audioResp = await fetch(audioUrl)
        if (!audioResp.ok) throw new Error(`Fetch failed: ${audioResp.statusText}`)

        const audioBlob = await audioResp.blob()
        const formData = new FormData()
        formData.append('file', audioBlob, 'audio.mp3')
        formData.append('model', 'whisper-large-v3-turbo')
        formData.append('response_format', 'json')

        const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqApiKey}` },
            body: formData,
        })

        if (!resp.ok) {
            const err = await resp.text()
            throw new Error(`Whisper error: ${err}`)
        }

        const result = await resp.json()
        return result.text || ''
    } catch (e) {
        console.error('[Whisper] Failed:', e)
        return ''
    }
}

// ============================================================================
// Twilio Messaging
// ============================================================================

async function sendTwilioMessage(to: string, body: string, source: 'sms' | 'whatsapp'): Promise<void> {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromWhatsApp = Deno.env.get('TWILIO_FROM_WHATSAPP')
    const fromSms = Deno.env.get('TWILIO_FROM_NUMBER')

    if (!accountSid || !authToken) {
        console.error('[Twilio] Missing credentials')
        return
    }

    const from = source === 'whatsapp' ? fromWhatsApp : fromSms
    const toNum = source === 'whatsapp' ? `whatsapp:${to}` : to

    if (!from) {
        console.error(`[Twilio] Missing FROM for ${source}`)
        return
    }

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: toNum, From: from, Body: body }),
        })

        if (!resp.ok) {
            const err = await resp.json()
            console.error('[Twilio] Error:', err)
        } else {
            console.log(`[Twilio] Sent to ${to}`)
        }
    } catch (e) {
        console.error('[Twilio] Failed:', e)
    }
}
