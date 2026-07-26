// io.ts — All side effects live here: Supabase, Twilio, Groq (LLM/vision/whisper).
// Keeping I/O in one module lets record.ts stay pure and unit-testable.

import { createClient } from '@supabase/supabase-js'

export const DEV_MODE = Deno.env.get('DEV_MODE') === 'true' || Deno.env.get('ENVIRONMENT') === 'dev' || Deno.env.get('SUPABASE_ENV') === 'dev' || true
const GROQ_MODEL = 'openai/gpt-oss-20b'
const GROQ_IMAGE_MODEL = 'qwen/qwen3.6-27b'

export function getSupabase() {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    return createClient(url, key)
}

// Wrap a promise with a timeout so a slow model call can't hang the whole turn.
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    const timeout = new Promise<T>((resolve) => {
        setTimeout(() => {
            console.log(`[Timeout] Operation timed out after ${ms}ms`)
            resolve(fallback)
        }, ms)
    })
    return Promise.race([promise, timeout])
}

// ============================================================================
// GROQ HELPERS
// ============================================================================

// One JSON-returning chat call. Returns parsed object or null on any failure.
// Pull a JSON object out of a string that may carry reasoning text or ```json fences.
function extractJsonObject(text: string | null | undefined): any | null {
    if (!text) return null
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const candidate = (fenced ? fenced[1] : text).trim()
    try { return JSON.parse(candidate) } catch { /* fall through */ }
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
        try { return JSON.parse(candidate.slice(start, end + 1)) } catch { /* noop */ }
    }
    return null
}

// One chat completion. reasoning_effort:'low' is critical for gpt-oss models: without it
// they spend the token budget on hidden reasoning and emit empty content, which trips
// Groq's json_object validator (json_validate_failed with empty failed_generation).
async function groqChat(messages: any[], maxTokens: number, jsonMode: boolean, model: string = GROQ_MODEL): Promise<string | null> {
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return null
    const body: any = {
        model,
        messages,
        temperature: 0.1,
        max_tokens: maxTokens,
    }
    // reasoning_effort only applies to the gpt-oss reasoning models; instruct models reject it.
    if (model.includes('gpt-oss')) body.reasoning_effort = 'low'
    if (jsonMode) body.response_format = { type: 'json_object' }

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    if (!resp.ok) {
        console.error(`[groqChat] API error (json=${jsonMode}):`, await resp.text())
        return null
    }
    const data = await resp.json()
    return data.choices?.[0]?.message?.content ?? null
}

export async function groqJson(
    prompt: string,
    opts: { system?: string; maxTokens?: number; model?: string } = {},
): Promise<any | null> {
    if (!Deno.env.get('GROQ_API_KEY')) return null
    const maxTokens = opts.maxTokens ?? 1500
    const model = opts.model ?? GROQ_MODEL

    const messages: any[] = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: prompt })

    try {
        // Attempt 1: strict JSON mode.
        const first = extractJsonObject(await groqChat(messages, maxTokens, true, model))
        if (first) return first

        // Attempt 2: plain call + manual extraction. More reliable when json_object mode
        // returns empty content for a reasoning model.
        console.log('[groqJson] JSON mode empty/invalid — retrying without response_format')
        const retryMessages = [...messages, { role: 'user', content: 'Return ONLY a single valid JSON object, no prose.' }]
        return extractJsonObject(await groqChat(retryMessages, maxTokens, false, model))
    } catch (e) {
        console.error('[groqJson] Error:', e)
        return null
    }
}

// Plain text chat (used for translation).
export async function groqText(system: string, user: string, maxTokens = 200): Promise<string | null> {
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return null
    try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                temperature: 0.1,
                max_tokens: maxTokens,
            }),
        })
        if (!resp.ok) return null
        const data = await resp.json()
        return data.choices?.[0]?.message?.content?.trim() || null
    } catch (e) {
        console.error('[groqText] Error:', e)
        return null
    }
}

export async function translateToEnglish(text: string): Promise<string> {
    const out = await groqText('Translate the following text to English. Return ONLY the translated text, nothing else.', text)
    return out || text
}

// ============================================================================
// MEDIA (with Twilio auth for fetching the assets)
// ============================================================================

function twilioAuthHeaders(url: string): Record<string, string> {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const auth = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
    if (sid && auth && url.includes('twilio.com')) {
        return { 'Authorization': `Basic ${btoa(`${sid}:${auth}`)}` }
    }
    return {}
}

async function fetchTwilioMedia(url: string): Promise<Response> {
    const headers = twilioAuthHeaders(url)
    let resp = await fetch(url, { headers, redirect: 'manual' })
    if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location')
        if (location) {
            console.log(`[TwilioMedia] Redirecting to S3 location: ${location.substring(0, 60)}...`)
            resp = await fetch(location, { redirect: 'follow' })
        }
    }
    return resp
}

export async function transcribeAudio(url: string): Promise<string | null> {
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return null
    try {
        const audioResp = await fetchTwilioMedia(url)
        if (!audioResp.ok) return null

        const blob = await audioResp.blob()
        const form = new FormData()
        form.append('file', blob, 'audio.ogg')
        form.append('model', 'whisper-large-v3')

        const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: form,
        })
        if (!resp.ok) return null
        const data = await resp.json()
        console.log(`[Transcribe] "${data.text?.substring(0, 50)}..."`)
        return data.text || null
    } catch (e) {
        console.error('[Transcribe] Error:', e)
        return null
    }
}

export function stripThinking(text: string | null | undefined): string {
    if (!text) return ''
    let cleaned = text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^["']|["']$/g, '')
        .trim()

    if (cleaned.length > 0 && !cleaned.startsWith('<think>')) {
        return cleaned
    }

    // If text was unclosed <think>... or only contained reasoning:
    const quotedMatch = text.match(/"([^"\n]{4,60})"/i) || text.match(/'([^'\n]{4,60})'/i)
    if (quotedMatch && quotedMatch[1]) {
        const q = quotedMatch[1].trim()
        if (!q.toLowerCase().startsWith('the ') && !q.toLowerCase().startsWith('phrase')) {
            return q
        }
    }

    const phraseMatch = text.match(/(?:Phrase|Summary|Trade|Action):\s*"?([^"\n]{3,60})"?/i)
    if (phraseMatch && phraseMatch[1]) {
        return phraseMatch[1].trim()
    }

    cleaned = text.replace(/<\/?think>/gi, '').trim()
    return cleaned
}

export function extractTradePhrase(raw: string | null | undefined): string {
    if (!raw) return ''
    let cleaned = stripThinking(raw)
        .replace(/<[^>]*>/g, '')
        .replace(/^["']|["']$/g, '')
        .replace(/^(Here is a description|This image shows|The photo shows|Visible trade:)\s*/i, '')
        .trim()

    if (!cleaned || cleaned.length < 3 || cleaned.toLowerCase().startsWith('the user') || cleaned.toLowerCase().includes('think')) {
        const quotedMatches = [...raw.matchAll(/"([^"\n]{4,60})"/g)]
        for (const m of quotedMatches) {
            const val = m[1].trim()
            const lower = val.toLowerCase()
            if (!lower.startsWith('the ') && !lower.startsWith('here ') && !lower.includes('word') && !lower.includes('format')) {
                cleaned = val
                break
            }
        }
    }

    if (!cleaned) return ''

    const lines = cleaned.split('\n')
        .map(l => l.replace(/^[0-9\.\-\*\)\s]+/, '').replace(/^(Phrase|Summary|Trade|Action):\s*/i, '').replace(/^"|"$/g, '').trim())
        .filter(l => l.length >= 3 && !l.toLowerCase().startsWith('here') && !l.toLowerCase().startsWith('this image') && !l.toLowerCase().startsWith('the user'))

    const bestLine = lines[0] || cleaned
    return bestLine.substring(0, 70).trim()
}

export async function getDirectImageUrl(url: string): Promise<string> {
    if (!url.includes('twilio.com')) return url
    try {
        const headers = twilioAuthHeaders(url)
        const resp = await fetch(url, { headers, redirect: 'manual' })
        if (resp.status >= 300 && resp.status < 400) {
            const location = resp.headers.get('location')
            if (location) {
                console.log(`[TwilioMedia] Resolved presigned S3 URL: ${location.substring(0, 80)}...`)
                return location
            }
        }
    } catch (e) {
        console.warn('[TwilioMedia] Redirect resolution warning:', e)
    }
    return url
}

function uint8ToBase64(bytes: Uint8Array): string {
    const gBuf = (globalThis as any).Buffer
    if (gBuf && typeof gBuf.from === 'function') {
        return gBuf.from(bytes).toString('base64')
    }
    const CHUNK_SIZE = 8192
    let binary = ''
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = Array.from(bytes.subarray(i, i + CHUNK_SIZE))
        binary += String.fromCharCode.apply(null, chunk)
    }
    return btoa(binary)
}

export async function analyzeImage(url: string): Promise<string> {
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
    const groqKey = Deno.env.get('GROQ_API_KEY')

    if (!openrouterKey && !groqKey) {
        console.error('[Vision] Neither OPENROUTER_API_KEY nor GROQ_API_KEY is available in environment!')
        return ''
    }

    try {
        console.log(`[Vision] Starting image analysis for URL: ${url}`)
        let imageUrlPayload: string = url

        if (url.startsWith('data:')) {
            console.log(`[Vision] Using pre-formatted Base64 Data URL (length: ${url.length})`)
            imageUrlPayload = url
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
            console.log(`[Vision] Fetching media bytes via fetchTwilioMedia...`)
            const imageResp = await fetchTwilioMedia(url)
            if (!imageResp.ok) {
                console.error(`[Vision] Image fetch failed with HTTP status ${imageResp.status}`)
                return ''
            }
            let contentType = imageResp.headers.get('content-type') || 'image/jpeg'
            if (!contentType.startsWith('image/')) {
                console.warn(`[Vision] Header Content-Type "${contentType}" is non-image, normalizing to image/jpeg`)
                contentType = 'image/jpeg'
            }
            const bytes = new Uint8Array(await imageResp.arrayBuffer())
            console.log(`[Vision] Successfully fetched ${bytes.byteLength} image bytes (MIME: ${contentType})`)

            const MAX_IMAGE_BYTES = 15 * 1024 * 1024
            if (bytes.byteLength > MAX_IMAGE_BYTES) {
                console.warn(`[Vision] Image size (${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB) exceeds limit. Skipping vision.`)
                return ''
            }

            imageUrlPayload = `data:${contentType};base64,${uint8ToBase64(bytes)}`
            console.log(`[Vision] Constructed Data URL payload (length: ${imageUrlPayload.length})`)
        } else {
            // Local file path
            console.log(`[Vision] Loading local file from path: ${url}`)
            const isDeno = typeof (globalThis as any).Deno !== 'undefined'
            let bytes: Uint8Array
            if (isDeno) {
                bytes = await (globalThis as any).Deno.readFile(url)
            } else {
                const fs = await import('node:fs')
                bytes = new Uint8Array(fs.readFileSync(url))
            }
            const ext = url.split('.').pop()?.toLowerCase() || 'jpeg'
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
            imageUrlPayload = `data:${mime};base64,${uint8ToBase64(bytes)}`
            console.log(`[Vision] Loaded ${bytes.byteLength} bytes from local file`)
        }

        let endpoint = 'https://api.groq.com/openai/v1/chat/completions'
        let apiKey = groqKey || ''
        let modelName = Deno.env.get('VISION_MODEL') || GROQ_IMAGE_MODEL
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        }

        if (openrouterKey) {
            endpoint = 'https://openrouter.ai/api/v1/chat/completions'
            apiKey = openrouterKey
            modelName = Deno.env.get('OPENROUTER_VISION_MODEL') || 'google/gemini-2.5-flash'
            headers['Authorization'] = `Bearer ${openrouterKey}`
            headers['HTTP-Referer'] = 'https://jtxfield.com'
            headers['X-Title'] = 'JtxField'
            console.log(`[Vision] Using OpenRouter Vision endpoint (${endpoint}) with model ${modelName}`)
        } else {
            headers['Authorization'] = `Bearer ${groqKey}`
            console.log(`[Vision] Using Groq Vision endpoint (${endpoint}) with model ${modelName}`)
        }

        const startTime = Date.now()
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: modelName,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert construction trade visual inspector. Analyze the photo and output a concise 3-to-6 word work description phrase summarizing the visible trade, action, and materials (e.g. "Masonry brick wall drilling", "Electrical panel & wiring work", "Plumbing PVC pipe fitting", "Drywall installation & taping"). Keep it strictly grounded to what is physically visible. Output ONLY this short phrase without introductory text or reasoning.'
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Analyze this work photo:' },
                            { type: 'image_url', image_url: { url: imageUrlPayload } },
                        ]
                    },
                ],
                temperature: 0.1,
                max_tokens: 50,
            }),
        })
        const duration = Date.now() - startTime
        console.log(`[Vision] Provider response received in ${duration}ms (HTTP ${resp.status})`)

        if (!resp.ok) {
            const errBody = await resp.text()
            console.error(`[Vision] Vision API returned HTTP ${resp.status}: ${errBody}`)
            return ''
        }
        const data = await resp.json()
        const rawContent = data.choices?.[0]?.message?.content || ''
        console.log(`[Vision] Raw content from Provider: "${rawContent}"`)
        if (!rawContent) {
            console.warn(`[Vision] Empty choices content from Provider:`, JSON.stringify(data))
        }
        const analysis = stripThinking(rawContent)
        const tradePhrase = extractTradePhrase(rawContent)
        console.log(`[Vision Analysis Result] Raw: "${analysis}" | Extracted Trade: "${tradePhrase}"`)
        return tradePhrase || analysis
    } catch (e) {
        console.error('[Vision] Error in analyzeImage:', e)
        return ''
    }
}

// ============================================================================
// TWILIO SEND
// ============================================================================

export async function sendMessage(phone: string, message: string, source: string) {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const fromNumber = Deno.env.get('TWILIO_FROM_WHATSAPP')!

    const params = new URLSearchParams({
        To: source === 'whatsapp' ? `whatsapp:${phone}` : phone,
        From: fromNumber,
        Body: message,
    })
    console.log(`[Send] To ${phone}: ${message.substring(0, 80)}`)

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    })
    if (!res.ok) {
        console.error(`[Send] Twilio error: ${res.status} - ${await res.text()}`)
    } else {
        const data = await res.json()
        console.log(`[Send] Sent. SID: ${data.sid}`)
    }
}
