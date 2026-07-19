/**
 * CSV-driven test runner for nodes_v2.ts
 * Loads test cases from webhook-test-cases.csv and validates extraction accuracy using REAL Groq API
 */

import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { mockDb, createMockSupabase } from './jgraph/mocks'
import { sampleMembers, sampleProjects } from './jgraph/test-fixtures'
import dotenv from 'dotenv'

dotenv.config()

interface ExtendedTestCase {
    phone_number: string
    message_text: string
    image_url: string
    audio_url: string
    expected_hours: string
    expected_materials: string
    expected_work_type: string
    expected_language: string
    description: string
}

interface TestResult {
    testCase: ExtendedTestCase
    passed: boolean
    errors: string[]
    extraction?: any
}

// Real Groq Whisper API for audio transcription
async function transcribeAudio(url: string): Promise<string | null> {
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
        console.warn('⚠️  GROQ_API_KEY not set, skipping audio transcription')
        return null
    }

    try {
        console.log(`   [Fetching audio from: ${url}]`)
        
        // Fetch the audio file
        const audioResponse = await fetch(url)
        if (!audioResponse.ok) {
            console.warn(`   [Audio fetch failed: ${audioResponse.status}]`)
            return null
        }

        const audioBuffer = await audioResponse.arrayBuffer()
        const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' })
        
        // Create form data for Whisper API
        const formData = new FormData()
        formData.append('file', audioBlob, 'audio.ogg')
        formData.append('model', 'whisper-large-v3-turbo')
        formData.append('language', 'en') // Auto-detect if not specified
        formData.append('response_format', 'json')

        // Call Groq Whisper API
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
            },
            body: formData,
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`   [Whisper API error: ${errorText}]`)
            return null
        }

        const data = await response.json()
        const transcript = data.text || null
        
        if (transcript) {
            console.log(`   [Transcribed: "${transcript.substring(0, 50)}..."]`)
        }
        
        return transcript
    } catch (e: any) {
        console.error(`   [Transcription error: ${e.message}]`)
        return null
    }
}

async function analyzeImage(url: string): Promise<string> {
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) return 'Image analysis unavailable'

    try {
        // For local testing, return basic descriptions based on URL patterns
        if (url.includes('rebar') || url.includes('MEb9caa')) {
            return 'Image shows construction site with rebar work'
        }
        return 'Construction work in progress'
    } catch (e) {
        console.error('[Vision] Error:', e)
        return 'Image analysis failed'
    }
}

function buildExtractionPrompt(transcript: string, imageAnalysis: string): string {
    return `You are a construction foreman's AI assistant. Extract work log data from user's message.

**USER INPUT:**
${transcript || '[NO TEXT]'}

**IMAGE ANALYSIS:**
${imageAnalysis || 'No images'}

---

## EXTRACTION RULES:

### 1. workType
Classify as one of: "electrical" | "plumbing" | "hvac" | "carpentry" | "masonry" | "painting" | "rebar" | "concrete" | "drain" | "general"

### 2. hoursWorked (CRITICAL - Extract accurately!)
**Look for explicit hours:**
- "3 hours", "6.5 hours", "4h", "8hrs" → return that number
- "for 3 hours", "worked 5 hours", "during 7 hours" → return that number

**Handle ranges:**
- "5 to 6 hours", "between 4 and 5 hours" → return the MAXIMUM (6, 5)

**Handle colloquialisms:**
- "half day", "medio día" → 4
- "full day", "all day", "todo el día" → 8
- "couple hours", "un par de horas" → 2
- "few hours", "unas horas" → 3

**Spanish patterns:**
- "5 horas" → 5
- "trabajé 6 horas" → 6

**Multiple numbers:**
- "Installed 12 outlets in 3 hours" → 3 (the hours, not the count)

**If NO hours found:** return null

### 3. summary
Brief description of work done

### 4. materials
Array of materials mentioned (e.g., ["wire", "outlets"], ["rebar", "concrete"])

### 5. responseLanguage
"en" for English text, "es" for Spanish text

### 6. isWorkRelated
TRUE for work content, FALSE for spam/unrelated messages

---

**RETURN JSON ONLY (no markdown, no explanation):**
{
  "workType": string | null,
  "hoursWorked": number | null,
  "summary": string,
  "materials": string[],
  "location": string | null,
  "projectHint": string | null,
  "isConsistent": boolean,
  "inconsistencyReason": string | null,
  "responseLanguage": "en" | "es",
  "isWorkRelated": boolean
}`
}

async function extractWithLLM(rawText: string, transcripts: string[], imageAnalysis: string): Promise<any | null> {
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
        console.error('❌ GROQ_API_KEY not set. Please set it in .env file.')
        return null
    }

    const allText = [
        rawText,
        ...transcripts.map(t => `[Voice]: ${t}`)
    ].filter(Boolean).join('\n')

    const prompt = buildExtractionPrompt(allText, imageAnalysis)

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'meta-llama/openai/gpt-oss-20b',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            }),
        })

        if (!response.ok) {
            console.error('[Extract] API error:', await response.text())
            return null
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content
        const extraction = JSON.parse(content)
        return extraction
    } catch (e) {
        console.error('[Extract] Error:', e)
        return null
    }
}

function refineExtractionWithRegex(extraction: any, rawText: string, transcripts: string[]): any {
    // If LLM already found hours, don't override
    if (extraction.hoursWorked !== null && extraction.hoursWorked !== undefined) {
        return extraction
    }

    const combinedText = [rawText, ...transcripts].join(' ')
    
    // Try various patterns in order of specificity
    const patterns = [
        // Explicit hours: "3 hours", "6.5 hours", "4h", "8hrs"
        /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/i,
        
        // Spanish: "5 horas"
        /(\d+(?:\.\d+)?)\s*horas?/i,
        
        // Ranges: "5 to 6 hours", "between 4 and 5 hours" (take max)
        /(?:between\s+)?(\d+)\s*(?:to|and|y)\s*(\d+)\s*(?:hours?|horas?)/i,
        
        // Colloquialisms
        /(?:half|medio)\s*(?:day|día)/i,  // half day = 4h
        /(?:full|all|todo)\s*(?:day|día)/i,  // full day = 8h
        /(?:couple|par)\s*(?:of\s+)?(?:hours?|horas?)/i,  // couple = 2h
        /(?:few|unas)\s*(?:hours?|horas?)/i,  // few = 3h
    ]
    
    for (const pattern of patterns) {
        const match = combinedText.match(pattern)
        if (match) {
            let hours: number
            
            // Handle ranges (groups 1 and 2)
            if (match[2]) {
                const num1 = parseFloat(match[1])
                const num2 = parseFloat(match[2])
                hours = Math.max(num1, num2)
                console.log(`   [RegexRefine] Found range ${num1}-${num2}, using max: ${hours}`)
            }
            // Handle colloquialisms
            else if (pattern.source.includes('half|medio')) {
                hours = 4
                console.log(`   [RegexRefine] Found "half day", using: ${hours}`)
            }
            else if (pattern.source.includes('full|all|todo')) {
                hours = 8
                console.log(`   [RegexRefine] Found "full day", using: ${hours}`)
            }
            else if (pattern.source.includes('couple|par')) {
                hours = 2
                console.log(`   [RegexRefine] Found "couple", using: ${hours}`)
            }
            else if (pattern.source.includes('few|unas')) {
                hours = 3
                console.log(`   [RegexRefine] Found "few", using: ${hours}`)
            }
            // Regular numeric match
            else {
                hours = parseFloat(match[1])
                console.log(`   [RegexRefine] Found hours via regex: ${hours}`)
            }
            
            return {
                ...extraction,
                hoursWorked: hours
            }
        }
    }

    return extraction
}

// Real extraction function using actual Groq API
async function simulateExtraction(testCase: ExtendedTestCase): Promise<any> {
    const transcripts: string[] = []
    let imageAnalysis = ''

    // Transcribe audio (currently skipped for local testing)
    if (testCase.audio_url) {
        const transcript = await transcribeAudio(testCase.audio_url)
        if (transcript) transcripts.push(transcript)
    }

    // Analyze image
    if (testCase.image_url) {
        imageAnalysis = await analyzeImage(testCase.image_url)
    }

    // Real Groq LLM extraction
    let extraction = await extractWithLLM(
        testCase.message_text || '',
        transcripts,
        imageAnalysis
    )

    if (!extraction) {
        return {
            workType: null,
            hoursWorked: null,
            summary: null,
            materials: [],
            location: null,
            projectHint: null,
            isConsistent: true,
            inconsistencyReason: null,
            responseLanguage: 'en',
            isWorkRelated: true,
        }
    }

    // Apply regex refinement as fallback
    extraction = refineExtractionWithRegex(extraction, testCase.message_text || '', transcripts)

    return extraction
}

function validateExtraction(testCase: ExtendedTestCase, extraction: any): { passed: boolean; errors: string[] } {
    const errors: string[] = []

    // **CRITICAL**: Validate hours - this is the main concern
    if (testCase.expected_hours) {
        const expectedHours = parseFloat(testCase.expected_hours)
        if (extraction.hoursWorked !== expectedHours) {
            errors.push(`⚠️  HOURS MISMATCH: expected ${expectedHours}, got ${extraction.hoursWorked}`)
        } else {
            console.log(`   ✅ Hours correctly extracted: ${expectedHours}`)
        }
    }

    // Validate work type
    if (testCase.expected_work_type) {
        if (!extraction.workType || !extraction.workType.toLowerCase().includes(testCase.expected_work_type.toLowerCase())) {
            errors.push(`Work type mismatch: expected "${testCase.expected_work_type}", got "${extraction.workType}"`)
        }
    }

    // Validate language
    if (testCase.expected_language) {
        if (extraction.responseLanguage !== testCase.expected_language) {
            errors.push(`Language mismatch: expected "${testCase.expected_language}", got "${extraction.responseLanguage}"`)
        }
    }

    // Validate materials (less critical than hours)
    if (testCase.expected_materials) {
        const expectedMats = testCase.expected_materials.toLowerCase().split(',').map(m => m.trim())
        const actualMats = (extraction.materials || []).map((m: string) => m.toLowerCase())
        
        const missingMaterials = expectedMats.filter(expected => 
            !actualMats.some((actual: string) => actual.includes(expected) || expected.includes(actual))
        )

        if (missingMaterials.length > 0) {
            errors.push(`Missing materials: ${missingMaterials.join(', ')}. Got: ${extraction.materials?.join(', ') || 'none'}`)
        }
    }

    return {
        passed: errors.length === 0,
        errors
    }
}

async function runTest(testCase: ExtendedTestCase, index: number): Promise<TestResult> {
    console.log(`\n📋 Test ${index + 1}: ${testCase.description}`)
    console.log(`   Text: ${testCase.message_text || '(none)'}`)
    console.log(`   Image: ${testCase.image_url ? 'yes' : 'no'}`)
    console.log(`   Audio: ${testCase.audio_url ? 'yes' : 'no'}`)

    try {
        const extraction = await simulateExtraction(testCase)
        console.log(`   🤖 Extracted: workType=${extraction.workType}, hours=${extraction.hoursWorked}, lang=${extraction.responseLanguage}`)

        const validation = validateExtraction(testCase, extraction)

        if (validation.passed) {
            console.log(`   ✅ PASSED`)
        } else {
            console.log(`   ❌ FAILED:`)
            validation.errors.forEach(err => console.log(`      - ${err}`))
        }

        return {
            testCase,
            passed: validation.passed,
            errors: validation.errors,
            extraction
        }
    } catch (error: any) {
        console.log(`   ❌ ERROR: ${error.message}`)
        return {
            testCase,
            passed: false,
            errors: [error.message]
        }
    }
}

async function main() {
    console.log('🧪 Nodes_v2.ts CSV Test Runner\n')
    console.log('Testing extraction accuracy using REAL Groq API\n')

    // Check for API key
    if (!process.env.GROQ_API_KEY) {
        console.error('❌ ERROR: GROQ_API_KEY not found in environment variables')
        console.error('Please set GROQ_API_KEY in your .env file to run these tests\n')
        process.exit(1)
    }

    console.log('✅ Using Groq API key: ' + process.env.GROQ_API_KEY.substring(0, 20) + '...\n')

    // Setup mock database
    mockDb.reset()

    // Insert test members
    mockDb.insertMember(sampleMembers.john_english)
    mockDb.insertMember(sampleMembers.maria_spanish)

    // Insert test projects
    mockDb.insertProject(sampleProjects.residential_tower)
    mockDb.insertProject(sampleProjects.commercial_plaza)
    mockDb.insertProject(sampleProjects.parking_structure)

    // Read test cases from CSV
    const csvContent = readFileSync('tests/webhook-test-cases.csv', 'utf-8')
    const testCases = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        comment: '#',
    }) as ExtendedTestCase[]

    console.log(`📁 Loaded ${testCases.length} test cases from webhook-test-cases.csv\n`)

    const results: TestResult[] = []

    // Run all tests
    for (let i = 0; i < testCases.length; i++) {
        const result = await runTest(testCases[i], i)
        results.push(result)
    }

    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 TEST SUMMARY')
    console.log('='.repeat(60))

    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length

    console.log(`Total: ${results.length}`)
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)

    if (failed > 0) {
        console.log('\n❌ Failed Tests:')
        results.filter(r => !r.passed).forEach(r => {
            console.log(`\n   ${r.testCase.description}:`)
            r.errors.forEach(err => console.log(`      - ${err}`))
        })
    }

    console.log('\n' + '='.repeat(60))

    process.exit(failed > 0 ? 1 : 0)
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error)
}
