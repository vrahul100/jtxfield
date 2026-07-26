// io.ts — All side effects live here: Supabase, Twilio, Groq (LLM/vision/whisper).
// Keeping I/O in one module lets record.ts stay pure and unit-testable.

import { createClient } from '@supabase/supabase-js'

export const DEV_MODE = Deno.env.get('DEV_MODE') === 'true'
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
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .replace(/<\/?think>/gi, '')
        .replace(/^["']|["']$/g, '')
        .trim()
}

export function extractTradePhrase(raw: string | null | undefined): string {
    if (!raw) return ''
    const cleaned = stripThinking(raw)
        .replace(/<[^>]*>/g, '')
        .replace(/^["']|["']$/g, '')
        .replace(/^(Here is a description|This image shows|The photo shows|Visible trade:)\s*/i, '')
        .trim()
    if (!cleaned) return ''

    const lines = cleaned.split('\n')
        .map(l => l.replace(/^[0-9\.\-\*\)\s]+/, '').trim())
        .filter(l => l.length >= 3 && !l.toLowerCase().startsWith('here') && !l.toLowerCase().startsWith('this image'))

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
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node
    if (isNode || typeof (globalThis as any).Buffer !== 'undefined') {
        return (globalThis as any).Buffer.from(bytes).toString('base64')
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
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) {
        console.error('[Vision] GROQ_API_KEY missing')
        return ''
    }
    try {
        console.log(`[Vision] Starting image analysis for: ${url.substring(0, 80)}`)
        let imageUrlPayload: string = url

        if (url.startsWith('data:')) {
            imageUrlPayload = url
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
            // First try direct presigned S3 URL (zero Base64 overhead, instant download by Groq)
            const directUrl = await getDirectImageUrl(url)
            imageUrlPayload = directUrl
        } else {
            // Local file path
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
        }

        let resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: GROQ_IMAGE_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert construction trade visual inspector. Analyze the photo and output a concise 3-to-6 word work description phrase summarizing the visible trade, action, and materials (e.g. "Masonry brick wall drilling", "Electrical panel & wiring work", "Plumbing PVC pipe fitting", "Drywall installation & taping"). Keep it strictly grounded to what is physically visible. Output ONLY this short phrase without introductory text.'
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
                max_tokens: 300,
            }),
        })

        // Fallback to Base64 data URL if direct S3 URL fetch by Groq fails
        if (!resp.ok && (url.startsWith('http://') || url.startsWith('https://'))) {
            console.warn(`[Vision] Direct URL fetch failed (HTTP ${resp.status}). Retrying with Base64 payload...`)
            const imageResp = await fetchTwilioMedia(url)
            if (imageResp.ok) {
                let contentType = imageResp.headers.get('content-type') || 'image/jpeg'
                if (!contentType.startsWith('image/')) contentType = 'image/jpeg'
                const bytes = new Uint8Array(await imageResp.arrayBuffer())
                if (bytes.byteLength <= 15 * 1024 * 1024) {
                    imageUrlPayload = `data:${contentType};base64,${uint8ToBase64(bytes)}`
                    resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: GROQ_IMAGE_MODEL,
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are an expert construction trade visual inspector. Analyze the photo and output a concise 3-to-6 word work description phrase summarizing the visible trade, action, and materials (e.g. "Masonry brick wall drilling", "Electrical panel & wiring work", "Plumbing PVC pipe fitting", "Drywall installation & taping"). Keep it strictly grounded to what is physically visible. Output ONLY this short phrase without introductory text.'
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
                            max_tokens: 300,
                        }),
                    })
                }
            }
        }

        if (!resp.ok) {
            const errBody = await resp.text()
            console.error(`[Vision] Groq API returned HTTP ${resp.status}: ${errBody}`)
            return ''
        }
        const data = await resp.json()
        const rawContent = data.choices?.[0]?.message?.content || ''
        if (!rawContent) {
            console.warn(`[Vision] Empty choices content from Groq Vision:`, JSON.stringify(data))
        }
        const analysis = stripThinking(rawContent)
        console.log(`[Vision Analysis Result] "${analysis.substring(0, 100)}..."`)
        return analysis
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
