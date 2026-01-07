// Supabase Edge Function: process-bucket
// Triggered by Postgres (pg_net) when a bucket's status changes to 'pending_processing'
// Implements: Media copy, Transcription, AI Extraction, Transaction creation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// AI Prompts
// ============================================================================

const CONSTRUCTION_PROMPT = `You are an AI assistant extracting construction work information from a CONVERSATION.

The input may contain MULTIPLE MESSAGES separated by "---" or newlines. This is a back-and-forth conversation where:
- User describes work done
- Assistant may ask follow-up questions
- User provides additional details

Extract the CUMULATIVE information from all messages. Return JSON with:
1. domain: "construction" (always for this prompt)
2. intent: "log" | "status" | "unknown"
3. projectName: The project/location mentioned (e.g., "Building A", "Main St project")
4. isProjectClear: true if you're confident which project
5. clarityScore: 0.0 to 1.0 rating of how clear the message is
6. summary: Brief 1-line summary of the work
7. hoursWorked: Number of hours spent (IMPORTANT: look for any number)
8. workersCount: Number of workers (default 1)
9. materialsUsed: Array of materials used (e.g., ["wire", "outlets"])
10. location: Where the work was done (e.g., "floor 3", "unit 5B")
11. workType: Type of work done (e.g., "electrical", "plumbing", "concrete")

CRITICAL CONSISTENCY CHECK:
12. isConsistent: MUST be false if text says one work type but image shows different work
13. inconsistencyReason: If isConsistent=false, explain the mismatch

IMPORTANT: ALWAYS try to extract projectName if ANY location or project is mentioned.
Return JSON only.`

// ============================================================================
// Helper Functions
// ============================================================================

async function transcribeAudio(audioUrl: string, groqApiKey: string): Promise<string> {
    try {
        console.log(`[Transcribe] Starting for: ${audioUrl}`)

        // Download audio file
        const response = await fetch(audioUrl)
        if (!response.ok) {
            throw new Error(`Failed to fetch audio: ${response.statusText}`)
        }

        const audioBlob = await response.blob()

        // Create form data for Groq Whisper API
        const formData = new FormData()
        formData.append('file', audioBlob, 'audio.mp3')
        formData.append('model', 'whisper-large-v3')
        formData.append('response_format', 'json')
        formData.append('temperature', '0.0')

        const transcriptionResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
            },
            body: formData,
        })

        if (!transcriptionResponse.ok) {
            const errorText = await transcriptionResponse.text()
            throw new Error(`Groq API error: ${transcriptionResponse.status} - ${errorText}`)
        }

        const result = await transcriptionResponse.json()
        console.log(`[Transcribe] ✅ Result: "${result.text}"`)
        return result.text || ''

    } catch (error) {
        console.error('[Transcribe] ❌ Failed:', error)
        return ''
    }
}

async function resolveImageUrl(url: string): Promise<string> {
    // Twilio URLs return 307 redirects which some APIs don't follow
    try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'follow' })
        return response.url || url
    } catch {
        return url
    }
}

interface ExtractionResult {
    domain: string
    intent: string
    projectName: string | null
    isProjectClear: boolean
    clarityScore: number
    summary: string
    isConsistent: boolean
    inconsistencyReason: string | null
    workType?: string
    hoursWorked?: number
    workersCount?: number
    materialsUsed?: string[]
    location?: string
}

async function extractMessageInfo(
    text: string,
    transcripts: string[],
    images: string[],
    groqApiKey: string
): Promise<ExtractionResult> {
    try {
        // Build user message content
        let textContent = text
        if (transcripts.length > 0) {
            textContent += `\n\n[VOICE TRANSCRIPTS]:\n${transcripts.join('\n')}`
        }

        const contentParts: unknown[] = [{ type: 'text', text: textContent }]

        // Add images for vision analysis
        for (const imageUrl of images.slice(0, 3)) {
            try {
                const finalUrl = await resolveImageUrl(imageUrl)
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: finalUrl }
                })
            } catch (error) {
                console.error(`[Extraction] Failed to resolve image URL: ${imageUrl}`, error)
            }
        }

        // Use vision model if images provided
        const model = images.length > 0
            ? 'meta-llama/llama-4-scout-17b-16e-instruct'
            : 'llama-3.3-70b-versatile'

        console.log(`[Extraction] Using model: ${model} (${images.length} images)`)

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: CONSTRUCTION_PROMPT },
                    { role: 'user', content: contentParts },
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Groq API error: ${response.status} - ${errorText}`)
        }

        const completion = await response.json()
        const rawResponse = completion.choices?.[0]?.message?.content || '{}'

        let extracted: Record<string, unknown>
        try {
            extracted = JSON.parse(rawResponse)
        } catch {
            console.warn('[Extraction] JSON parse failed, using defaults')
            const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
            extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
        }

        return {
            domain: (extracted.domain as string) || 'construction',
            intent: (extracted.intent as string) || 'unknown',
            projectName: (extracted.projectName as string) || null,
            isProjectClear: (extracted.isProjectClear as boolean) || false,
            clarityScore: (extracted.clarityScore as number) || 0.5,
            summary: (extracted.summary as string) || text.slice(0, 100),
            isConsistent: extracted.isConsistent !== false,
            inconsistencyReason: (extracted.inconsistencyReason as string) || null,
            workType: extracted.workType as string | undefined,
            hoursWorked: extracted.hoursWorked as number | undefined,
            workersCount: extracted.workersCount as number | undefined,
            materialsUsed: extracted.materialsUsed as string[] | undefined,
            location: extracted.location as string | undefined,
        }

    } catch (error) {
        console.error('[Extraction] Error:', error)
        return {
            domain: 'construction',
            intent: 'unknown',
            projectName: null,
            isProjectClear: false,
            clarityScore: 0.5,
            summary: text.slice(0, 100),
            isConsistent: true,
            inconsistencyReason: null,
        }
    }
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
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

        console.log(`[ProcessBucket] 🚀 Starting processing for bucket #${bucketId}`)

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const groqApiKey = Deno.env.get('GROQ_API_KEY')

        const supabase = createClient(supabaseUrl, supabaseKey)

        // 1. Fetch the bucket with member info
        const { data: bucket, error: fetchError } = await supabase
            .from('buckets')
            .select('*, members(*)')
            .eq('id', bucketId)
            .single()

        if (fetchError || !bucket) {
            console.error(`[ProcessBucket] Bucket not found:`, fetchError)
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 2. Update status to 'processing'
        await supabase
            .from('buckets')
            .update({ status: 'processing' })
            .eq('id', bucketId)

        // 3. Copy media from Twilio to Supabase Storage
        const imageUrls = bucket.image_urls ? JSON.parse(bucket.image_urls) : []
        const audioUrls = bucket.audio_urls ? JSON.parse(bucket.audio_urls) : []

        const copiedImages: string[] = []
        const copiedAudio: string[] = []

        for (const url of imageUrls) {
            try {
                const copied = await copyMediaToStorage(supabase, url, 'images', bucketId)
                copiedImages.push(copied)
            } catch (e) {
                console.error(`[ProcessBucket] Failed to copy image:`, e)
                copiedImages.push(url) // Keep original on failure
            }
        }

        for (const url of audioUrls) {
            try {
                const copied = await copyMediaToStorage(supabase, url, 'audio', bucketId)
                copiedAudio.push(copied)
            } catch (e) {
                console.error(`[ProcessBucket] Failed to copy audio:`, e)
                copiedAudio.push(url) // Keep original on failure
            }
        }

        // 4. TRANSCRIPTION - Get transcripts for audio files
        const transcripts: string[] = bucket.transcripts ? JSON.parse(bucket.transcripts) : []

        if (groqApiKey && audioUrls.length > 0 && transcripts.length === 0) {
            console.log(`[ProcessBucket] 🎙️ Transcribing ${audioUrls.length} audio file(s)`)

            for (const audioUrl of audioUrls) {
                const transcript = await transcribeAudio(audioUrl, groqApiKey)
                if (transcript) {
                    transcripts.push(transcript)
                }
            }

            console.log(`[ProcessBucket] Got ${transcripts.length} transcript(s)`)
        }


        // 5. AI EXTRACTION - Extract structured data from text/transcripts/images
        let extractedData: ExtractionResult | null = null

        if (groqApiKey) {
            console.log(`[ProcessBucket] 🤖 Running AI extraction`)

            extractedData = await extractMessageInfo(
                bucket.raw_text || '',
                transcripts,
                copiedImages.length > 0 ? copiedImages : imageUrls,
                groqApiKey
            )

            console.log(`[ProcessBucket] Extraction result:`, JSON.stringify(extractedData, null, 2))
        }

        // ============================================================================
        // 6. VALIDATION & REPLY LOGIC (Migrated from Webhook)
        // ============================================================================
        const MAX_ATTEMPTS = 2
        let validationErrors: string[] = []
        let questions: string[] = []
        let shouldCreateTransaction = false
        const currentAttempts = bucket.validation_attempts || 0

        if (extractedData) {
            // A. Consistency Check
            if (!extractedData.isConsistent && extractedData.inconsistencyReason) {
                if (currentAttempts >= MAX_ATTEMPTS) {
                    // Too many attempts, just file it pending review
                    validationErrors.push('Inconsistency persists after retries')
                    questions.push('📋 Filing for review.')
                } else {
                    // Ask user
                    questions.push(`⚠️ The details don't look right. ${extractedData.inconsistencyReason}`)
                }
            }
            // B. Schema Validation
            else {
                // Check required fields (manually since we don't have Zod in Deno environment easily without imports)
                // Required: hoursWorked, workType (for Construction)
                const missingFields: string[] = []
                if (!extractedData.hoursWorked && extractedData.intent === 'log') missingFields.push('hoursWorked')
                if (!extractedData.workType && extractedData.intent === 'log') missingFields.push('workType')

                if (missingFields.length > 0) {
                    if (currentAttempts >= MAX_ATTEMPTS) {
                        validationErrors.push(`Missing fields: ${missingFields.join(', ')}`)
                        questions.push('📋 Missing details. Filing for review.')
                    } else {
                        // Ask specific questions
                        if (missingFields.includes('hoursWorked')) questions.push(FIELD_QUESTIONS['hoursWorked'])
                        if (missingFields.includes('workType')) questions.push(FIELD_QUESTIONS['workType'])
                    }
                } else {
                    // C. Clarity Check
                    if (extractedData.clarityScore < 0.6) {
                        if (currentAttempts >= MAX_ATTEMPTS) {
                            validationErrors.push('Low clarity score')
                            questions.push('📋 Unclear details. Filing for review.')
                        } else {
                            questions.push('🤔 Could you provide a bit more detail?')
                        }
                    } else {
                        // ALL GOOD!
                        shouldCreateTransaction = true
                    }
                }
            }
        }

        // D. Send Reply if Questions Exist
        if (questions.length > 0) {
            console.log(`[ProcessBucket] 🗣️ Sending validation questions:`, questions)

            // Combine questions into one message
            const replyText = questions.join('\n\n')
            await sendTwilioMessage(bucket.from_phone, replyText, bucket.source)

            // Increment attempts
            await supabase
                .from('buckets')
                .update({
                    status: 'open', // Keep open for reply (or pending_review if given up)
                    validation_attempts: currentAttempts + 1,
                    validation_errors: validationErrors.length > 0 ? JSON.stringify(validationErrors) : null,
                    ai_response: extractedData // Save partial extraction
                })
                .eq('id', bucketId)

            // If we gave up, move to pending_review
            if (currentAttempts >= MAX_ATTEMPTS) {
                await supabase
                    .from('buckets')
                    .update({ status: 'pending_review' })
                    .eq('id', bucketId)
            }

            return new Response(JSON.stringify({ success: true, action: 'asked_questions', questions }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 7. UPDATE BUCKET & CREATE TRANSACTION (If Valid)
        const updateData: Record<string, unknown> = {
            status: shouldCreateTransaction ? 'submitted' : 'pending_review', // Default to pending_review if no logic matched
            image_urls: JSON.stringify(copiedImages.length > 0 ? copiedImages : imageUrls),
            audio_urls: JSON.stringify(copiedAudio.length > 0 ? copiedAudio : audioUrls),
            transcripts: JSON.stringify(transcripts),
        }

        if (extractedData) {
            updateData.extracted_data = extractedData
            updateData.domain = extractedData.domain
            updateData.intent = extractedData.intent
            updateData.project_name_raw = extractedData.projectName
            updateData.clarity_score = extractedData.clarityScore
            updateData.summary = extractedData.summary
        }

        await supabase
            .from('buckets')
            .update(updateData)
            .eq('id', bucketId)

        if (shouldCreateTransaction && extractedData) {
            console.log(`[ProcessBucket] 📝 Creating transaction`)

            // Build evidence JSON
            const evidenceItems = [
                ...(copiedImages.length > 0 ? copiedImages : imageUrls),
                ...(copiedAudio.length > 0 ? copiedAudio : audioUrls),
            ]

            const txnData = {
                bucket_id: bucketId,
                company_id: bucket.node_id,
                user_id: bucket.member_id,
                project_id: bucket.project_id,
                job: extractedData.projectName,
                time: extractedData.hoursWorked || null,
                labor: bucket.raw_text,
                material: extractedData.materialsUsed?.join(', ') || null,
                evidence: evidenceItems.length > 0 ? JSON.stringify(evidenceItems) : null,
                scope_description: extractedData.summary,
                status: 'COMPLETED',
            }

            const { error: txnError } = await supabase
                .from('txns')
                .insert(txnData)

            if (txnError) {
                console.error(`[ProcessBucket] Failed to create transaction:`, txnError)
            } else {
                console.log(`[ProcessBucket] ✅ Transaction created`)

                // Send Success Message
                const successMsg = `✅ Ticket logged: ${extractedData.summary}\n• Hours: ${extractedData.hoursWorked}\n• Workers: ${extractedData.workersCount}`
                await sendTwilioMessage(bucket.from_phone, successMsg, bucket.source)
            }
        }

        console.log(`[ProcessBucket] ✅ Bucket #${bucketId} fully processed`)

        return new Response(JSON.stringify({ success: true, bucketId, extracted: extractedData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: unknown) {
        console.error('[ProcessBucket] Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})

// ============================================================================
// Storage Helper
// ============================================================================

async function copyMediaToStorage(
    supabase: ReturnType<typeof createClient>,
    sourceUrl: string,
    folder: 'images' | 'audio',
    bucketId: number
): Promise<string> {
    const response = await fetch(sourceUrl)
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`)

    const blob = await response.blob()
    const ext = getExtension(response.headers.get('content-type') || '')
    const path = `${folder}/${new Date().toISOString().split('T')[0]}/${bucketId}-${crypto.randomUUID().slice(0, 8)}${ext}`

    const { error } = await supabase.storage
        .from('media')
        .upload(path, blob, { contentType: blob.type, upsert: false })

    if (error) throw error

    const { data } = supabase.storage.from('media').getPublicUrl(path)
    return data.publicUrl
}


function getExtension(contentType: string): string {
    const map: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'audio/mpeg': '.mp3',
        'audio/ogg': '.ogg',
    }
    return map[contentType] || ''
}

// ============================================================================
// Logic Helpers
// ============================================================================

const FIELD_QUESTIONS: Record<string, string> = {
    workType: 'What type of work did you do? (electrical, plumbing, hvac, carpentry, etc.)',
    hoursWorked: 'How many hours did this take?',
    workersCount: 'How many workers were involved?',
    materialsUsed: 'What materials did you use?',
    location: 'Where specifically was this work done? (e.g., "floor 3", "room 5B")',
}

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
        console.error(`[Twilio] Missing FROM number for ${source}`)
        return
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                To: toNum,
                From: from,
                Body: body
            })
        })

        if (!resp.ok) {
            const err = await resp.json()
            console.error('[Twilio] Error sending message:', err)
        } else {
            console.log(`[Twilio] Sent message to ${to}`)
        }
    } catch (e) {
        console.error('[Twilio] Fetch failed:', e)
    }
}
