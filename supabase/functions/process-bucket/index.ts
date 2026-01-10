// Supabase Edge Function: process-bucket
// ADAPTIVE BRAIN - Powered by XState
// Clean state machine for robust conversation handling

import { runBrain } from './jgraph/graph.ts'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

        console.log(`[Brain] 🧠 Starting jField for bucket #${bucketId}`)

        // IDEMPOTENCY CHECK: Skip if already processing or completed
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { data: bucket } = await supabase
            .from('buckets')
            .select('status')
            .eq('id', bucketId)
            .single()

        const skipStatuses = ['processing', 'submitted', 'flagged', 'pending_review']
        if (bucket && skipStatuses.includes(bucket.status)) {
            console.log(`[Brain] ⏭️ Skipping bucket #${bucketId} - already ${bucket.status}`)
            return new Response(JSON.stringify({
                success: true,
                action: 'skipped',
                reason: `Already ${bucket.status}`
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Acquire lock by setting status to processing (atomic operation)
        // Use .select() to check if we actually updated a row
        const { data: lockResult, error: lockError } = await supabase
            .from('buckets')
            .update({ status: 'processing' })
            .eq('id', bucketId)
            .in('status', ['open', 'pending_processing']) // Only lock if in these statuses
            .select('id')

        if (lockError) {
            console.log(`[Brain] ⏭️ Lock error for bucket #${bucketId}:`, lockError)
            return new Response(JSON.stringify({ success: true, action: 'lock_error' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // If no rows were updated, another process already has the lock
        if (!lockResult || lockResult.length === 0) {
            console.log(`[Brain] ⏭️ Lock not acquired for bucket #${bucketId} - another process has it`)
            return new Response(JSON.stringify({ success: true, action: 'lock_not_acquired' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        console.log(`[Brain] 🔒 Lock acquired for bucket #${bucketId}`)

        // Run the LangGraph state machine
        const finalState = await runBrain(bucketId)

        console.log(`[Brain] ✅ Completed: action=${finalState.action}, status=${finalState.status}`)

        return new Response(JSON.stringify({
            success: true,
            action: finalState.action,
            status: finalState.status,
            response: finalState.response,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error('[Brain] ❌ Error:', error)
        return new Response(JSON.stringify({ error: 'Internal error', details: String(error) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
