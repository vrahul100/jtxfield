// Supabase Edge Function: process-bucket
// MINIMAL VERSION - No validation, just save and confirm

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

        console.log(`[ProcessBucket] Processing bucket #${bucketId}`)

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Fetch bucket
        const { data: bucket, error: fetchError } = await supabase
            .from('buckets')
            .select('*')
            .eq('id', bucketId)
            .single()

        if (fetchError || !bucket) {
            console.error(`[ProcessBucket] Bucket not found:`, fetchError)
            return new Response(JSON.stringify({ error: 'Bucket not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Mark as submitted
        await supabase
            .from('buckets')
            .update({ status: 'submitted' })
            .eq('id', bucketId)

        // Send confirmation
        const successMsg = `✅ Ticket #${bucketId} saved!`
        await sendTwilioMessage(bucket.from_phone, successMsg, bucket.source)

        console.log(`[ProcessBucket] ✅ Bucket #${bucketId} saved`)

        return new Response(JSON.stringify({ success: true, bucketId }), {
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
            console.error('[Twilio] Error:', err)
        } else {
            console.log(`[Twilio] Sent to ${to}`)
        }
    } catch (e) {
        console.error('[Twilio] Failed:', e)
    }
}
