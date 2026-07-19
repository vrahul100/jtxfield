/**
 * Text-to-Speech service using Groq's Orpheus model
 * Generates audio responses for WhatsApp voice notes
 */

import { createClient } from '@supabase/supabase-js'

const TTS_MODEL = 'canopylabs/orpheus-v1-english'  // Fast, natural-sounding TTS
const MAX_TEXT_LENGTH = 500  // Truncate very long responses

/**
 * Convert text to speech using Groq TTS API
 * @param text - Text to convert to speech
 * @param lang - Language hint ('en' or 'es')
 * @returns Audio blob or null on failure
 */
export async function synthesizeSpeech(
    text: string,
    lang: 'en' | 'es' = 'en'
): Promise<Blob | null> {
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) {
        console.warn('[TTS] No GROQ_API_KEY configured')
        return null
    }

    // Truncate very long text to avoid TTS issues
    const truncatedText = text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH) + '...'
        : text

    try {
        console.log(`[TTS] Synthesizing ${truncatedText.length} chars (lang: ${lang})`)

        const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: TTS_MODEL,
                input: truncatedText,
                voice: 'daniel',  // Natural female voice
                response_format: 'wav',
                speed: 1.0,
            }),
        })

        if (!response.ok) {
            const error = await response.text()
            console.error(`[TTS] API error: ${response.status} - ${error}`)
            return null
        }

        const audioBlob = await response.blob()
        console.log(`[TTS] ✅ Generated ${audioBlob.size} bytes of audio`)
        return audioBlob

    } catch (error) {
        console.error('[TTS] Synthesis error:', error)
        return null
    }
}

/**
 * Generate audio response and upload to Supabase Storage
 * @param text - Response text to convert
 * @param lang - Language
 * @param bucketId - For unique filename
 * @returns Public URL of uploaded audio or null
 */
export async function generateAudioResponse(
    text: string,
    lang: 'en' | 'es',
    bucketId: number
): Promise<string | null> {
    const audioBlob = await synthesizeSpeech(text, lang)
    if (!audioBlob) return null

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const storageBucket = Deno.env.get('STORAGE_BUCKET') || 'media'
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Log environment info for debugging
        const isDev = false
        const envLabel = isDev ? 'DEV' : 'PROD'
        console.log(`[TTS] 🔧 Environment: ${envLabel} | Bucket: ${storageBucket}`)

        // Validate audio blob - Twilio needs at least ~1KB to process
        const MIN_AUDIO_SIZE = 1000  // 1KB minimum
        if (audioBlob.size < MIN_AUDIO_SIZE) {
            console.error(`[TTS] ❌ Audio too small: ${audioBlob.size} bytes (min: ${MIN_AUDIO_SIZE})`)
            return null
        }

        // Upload to Supabase Storage with env-specific path prefix
        const envPrefix = isDev ? 'dev' : 'prod'
        const filename = `audio/responses/${envPrefix}/${bucketId}-${Date.now()}.mp3`

        // Convert Blob to ArrayBuffer for upload
        const arrayBuffer = await audioBlob.arrayBuffer()

        const { data, error } = await supabase.storage
            .from(storageBucket)
            .upload(filename, arrayBuffer, {
                contentType: 'audio/mpeg',
                upsert: false,
            })

        if (error) {
            console.error(`[TTS] Upload error (${envLabel}):`, error)
            return null
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(storageBucket)
            .getPublicUrl(filename)

        const publicUrl = urlData.publicUrl
        console.log(`[TTS] ✅ Uploaded to ${envLabel}: ${publicUrl}`)

        // Verify the file is accessible (Twilio will also fetch this)
        try {
            const verifyResp = await fetch(publicUrl, { method: 'HEAD' })
            const contentType = verifyResp.headers.get('content-type')
            const contentLength = verifyResp.headers.get('content-length')
            console.log(`[TTS] 🔍 Verify: status=${verifyResp.status}, type=${contentType}, size=${contentLength}`)

            if (!verifyResp.ok) {
                console.error(`[TTS] ❌ URL not accessible: ${verifyResp.status}`)
                return null
            }
        } catch (verifyError) {
            console.error(`[TTS] ❌ Verify failed:`, verifyError)
            // Continue anyway - might work for Twilio
        }

        return publicUrl

    } catch (error) {
        console.error('[TTS] Upload failed:', error)
        return null
    }
}
