// Supabase Edge Function: process-bucket
// Triggered by Postgres when a bucket's status changes to 'pending_processing'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
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

        console.log(`[ProcessBucket] Processing bucket #${bucketId}`)

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // 1. Fetch the bucket
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

        // 3. Copy media from Twilio to Supabase Storage (async)
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

        // 4. TODO: Transcription (call Groq/Whisper API)
        // 5. TODO: AI Extraction (call Groq API)
        // 6. TODO: Create transaction

        // For now, just mark as submitted
        await supabase
            .from('buckets')
            .update({
                status: 'submitted',
                image_urls: JSON.stringify(copiedImages),
                audio_urls: JSON.stringify(copiedAudio),
            })
            .eq('id', bucketId)

        console.log(`[ProcessBucket] ✅ Bucket #${bucketId} processed`)

        return new Response(JSON.stringify({ success: true, bucketId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error('[ProcessBucket] Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})

// Helper: Copy media from Twilio URL to Supabase Storage
async function copyMediaToStorage(
    supabase: any,
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
