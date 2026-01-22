// Simple health check to test edge function performance
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const startTime = Date.now()

    try {
        // Test 1: Basic response
        const test1Time = Date.now()
        
        // Test 2: Supabase connection
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)
        
        const dbStart = Date.now()
        const { data, error } = await supabase.from('buckets').select('id').limit(1)
        const dbDuration = Date.now() - dbStart
        
        // Test 3: External API call (httpbin.org echo)
        const apiStart = Date.now()
        const apiResponse = await fetch('https://httpbin.org/delay/1')
        await apiResponse.json()
        const apiDuration = Date.now() - apiStart
        
        // Test 4: Groq API call (simple chat completion)
        const groqKey = Deno.env.get('GROQ_API_KEY')
        let groqDuration = 0
        let groqResult: any = null
        
        if (groqKey) {
            const groqStart = Date.now()
            try {
                const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [{ role: 'user', content: 'Say "test" and nothing else' }],
                        temperature: 0.1,
                        max_tokens: 10,
                    }),
                })
                
                groqDuration = Date.now() - groqStart
                
                if (groqResponse.ok) {
                    const groqData = await groqResponse.json()
                    groqResult = {
                        success: true,
                        response: groqData.choices?.[0]?.message?.content || 'no content',
                        model: groqData.model
                    }
                } else {
                    groqResult = {
                        success: false,
                        status: groqResponse.status,
                        error: await groqResponse.text()
                    }
                }
            } catch (e) {
                groqDuration = Date.now() - groqStart
                groqResult = { success: false, error: String(e) }
            }
        }
        
        const totalDuration = Date.now() - startTime
        
        return new Response(JSON.stringify({
            success: true,
            tests: {
                startup: test1Time - startTime,
                database_query: dbDuration,
                external_api: apiDuration,
                groq_llm: groqDuration,
                total: totalDuration
            },
            database_result: error ? { error: error.message } : { count: data?.length || 0 },
            api_result: { status: apiResponse.status },
            groq_result: groqResult
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error) {
        return new Response(JSON.stringify({
            error: String(error),
            duration: Date.now() - startTime
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
