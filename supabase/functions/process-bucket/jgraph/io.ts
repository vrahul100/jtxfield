// io.ts — All side effects live here: Supabase, Twilio, Groq (LLM/vision/whisper).
// Keeping I/O in one module lets record.ts stay pure and unit-testable.

import { createClient } from '@supabase/supabase-js'

export const DEV_MODE = Deno.env.get('DEV_MODE') === 'true'
const GROQ_MODEL = 'openai/gpt-oss-20b'

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
async function groqChat(messages: any[], maxTokens: number, jsonMode: boolean): Promise<string | null> {
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return null
    const body: any = {
        model: GROQ_MODEL,
        messages,
        temperature: 0.1,
        max_tokens: maxTokens,
        reasoning_effort: 'low',
    }
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
    opts: { system?: string; maxTokens?: number } = {},
): Promise<any | null> {
    if (!Deno.env.get('GROQ_API_KEY')) return null
    const maxTokens = opts.maxTokens ?? 1500

    const messages: any[] = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: prompt })

    try {
        // Attempt 1: strict JSON mode.
        const first = extractJsonObject(await groqChat(messages, maxTokens, true))
        if (first) return first

        // Attempt 2: plain call + manual extraction. More reliable when json_object mode
        // returns empty content for a reasoning model.
        console.log('[groqJson] JSON mode empty/invalid — retrying without response_format')
        const retryMessages = [...messages, { role: 'user', content: 'Return ONLY a single valid JSON object, no prose.' }]
        return extractJsonObject(await groqChat(retryMessages, maxTokens, false))
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

export async function transcribeAudio(url: string): Promise<string | null> {
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return null
    try {
        const audioResp = await fetch(url, { headers: twilioAuthHeaders(url) })
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

export async function analyzeImage(url: string): Promise<string> {
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return ''
    try {
        const imageResp = await fetch(url, { headers: twilioAuthHeaders(url), redirect: 'follow' })
        if (!imageResp.ok) return ''

        const contentType = imageResp.headers.get('content-type') || 'image/jpeg'
        const bytes = new Uint8Array(await imageResp.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 8192) {
            binary += String.fromCharCode.apply(null, bytes.slice(i, i + 8192) as unknown as number[])
        }
        const dataUrl = `data:${contentType};base64,${btoa(binary)}`

        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: 'Describe this construction/work photo. Focus on the SPECIFIC TRADE or WORK TYPE visible (masonry, electrical, plumbing, painting, carpentry, concrete, rebar, HVAC, drain). List: 1) Trade/work type, 2) Materials visible, 3) Completion status.' },
                    { role: 'user', content: [
                        { type: 'text', text: 'Analyze this work photo:' },
                        { type: 'image_url', image_url: { url: dataUrl } },
                    ] },
                ],
                temperature: 0.1,
                max_tokens: 500,
            }),
        })
        if (!resp.ok) return ''
        const data = await resp.json()
        const analysis = data.choices?.[0]?.message?.content || ''
        console.log(`[Vision] "${analysis.substring(0, 80)}..."`)
        return analysis
    } catch (e) {
        console.error('[Vision] Error:', e)
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
