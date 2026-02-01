import Groq from 'groq-sdk';
import { getSchemaForDomain, FIELD_QUESTIONS } from '../schemas/domainSchemas.js';

// Lazy-initialize to ensure dotenv has loaded
let groq: Groq | null = null;
function getGroq(): Groq {
    if (!groq) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groq;
}

/**
 * Resolve image URL by following redirects
 * Twilio URLs return 307 redirects which Groq vision API doesn't follow
 */
async function resolveImageUrl(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'manual' // Don't auto-follow, we'll extract Location
        });

        // If 307 or 3xx redirect, get Location header
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (location) {
                console.log(`[RESOLVE] Following redirect: ${url} -> ${location}`);
                return location;
            }
        }

        // No redirect, return original
        return url;
    } catch (error) {
        console.error(`[RESOLVE] Error resolving URL, using original:`, error);
        return url;
    }
}

export interface ExtractionResult {
    domain: 'construction' | 'recovery' | string;
    intent: 'log' | 'recovery' | 'status' | 'unknown';
    projectName: string | null;
    isProjectClear: boolean;
    clarityScore: number;
    summary: string;

    // Consistency checking
    isConsistent: boolean;               // Are text, audio, and images aligned?
    inconsistencyReason: string | null;  // Why they don't match

    // Domain-specific fields (construction)
    workType?: string;
    hoursWorked?: number;
    workersCount?: number;
    materialsUsed?: string[];
    location?: string;

    // Domain-specific fields (recovery)
    damageType?: string;
    affectedArea?: number;
    urgency?: 'low' | 'medium' | 'high';
    recoveryAction?: 'repair' | 'replace' | 'inspect' | 'emergency';
    damageDescription?: string;
}

const CONSTRUCTION_PROMPT = `You are an AI assistant extracting construction work information from a CONVERSATION.

The input may contain MULTIPLE MESSAGES separated by "---" or newlines. This is a back-and-forth conversation where:
- Earlier messages describe the work
- Later messages may be SHORT ANSWERS (like "4" or "yes" or "3 hours") responding to questions

IMPORTANT: If you see a short answer like just a number (e.g., "4", "2", "8"), interpret it as HOURS WORKED unless context clearly indicates otherwise. Workers often reply with just numbers when asked about hours.

Analyze ALL inputs (text + voice transcripts + images) and extract these fields:
1. intent: "log" (recording work), "recovery" (damage), "status" (asking), or "unknown"
2. projectName: ALWAYS extract the suspected project name if mentioned, even if you're not certain (e.g., "The Mall", "East Wing School", "Hospital Project")
3. isProjectClear: true if you're confident which project, false if uncertain
4. clarityScore: 0.0 to 1.0 rating of how clear the message is
5. summary: Brief 1-line summary of the work done
6. workType: "electrical" | "plumbing" | "hvac" | "carpentry" | "masonry" | "painting" | "rebar" | "concrete" | "drain" | "general"
7. hoursWorked: Number of hours spent as a JSON NUMBER.
   - Look for patterns like "took me 6.5 hours", "worked for 4 hrs", "3.5h today".
   - If someone just says a number like "4" in response to an hours question, that's 4 hours.
8. workersCount: Number of workers (default 1)
9. materialsUsed: Array of materials used (e.g., ["wire", "outlets", "drains"])
10. location: Where the work was done (e.g., "floor 3", "unit 5B")

CRITICAL CONSISTENCY CHECK:
11. isConsistent: MUST be false if:
    - Text says one work type (e.g., "plumbing") but image shows different work (e.g., electrical wiring, tools, materials)
    - Voice transcript contradicts what's visible in the image
    - Any clear mismatch between what they SAY and what the IMAGE shows
12. inconsistencyReason: If isConsistent=false, write a clear question like:
    "The image shows electrical wiring work, but you mentioned plumbing. Which is correct?"
    
IMPORTANT: If you see an image, ALWAYS analyze it carefully. Default isConsistent to FALSE if there's any doubt about image/text matching.

IMPORTANT: ALWAYS try to extract projectName if ANY location or project is mentioned. Even partial names like "the school" or "mall project" are valuable tags.

IMPORTANT: Always try to extract hoursWorked if mentioned in natural language like "3 hours" or "for 4 hours".

Return JSON only.`;

const RECOVERY_PROMPT = `You are an AI assistant extracting recovery/damage information.

Analyze ALL inputs (text + voice transcripts + images) and extract these fields:
1. intent: "log" | "recovery" | "status" | "unknown"
2. projectName: ALWAYS extract the suspected project name if mentioned, even if uncertain (e.g., "The Mall", "East Wing School")
3. isProjectClear: true if you're confident which project, false if uncertain
4. clarityScore: 0.0 to 1.0 rating of how clear the message is
5. summary: Brief 1-line summary
6. damageType: Description of damage (e.g., "water damage", "structural crack")
7. affectedArea: Size in square feet
8. urgency: "low" | "medium" | "high"
9. recoveryAction: "repair" | "replace" | "inspect" | "emergency"
10. damageDescription: Detailed description if provided

CRITICAL CONSISTENCY CHECK:
11. isConsistent: true if text, voice, and images all describe the same damage/issue
12. inconsistencyReason: If isConsistent=false, explain the mismatch

IMPORTANT: ALWAYS try to extract projectName if ANY location or project is mentioned.

Always try to extract damageType, affectedArea, and urgency.

Return JSON only.`;

/**
 * Extract structured information from a message using AI
 * Checks consistency across text, audio, and images
 */
export async function extractMessageInfo(
    text: string,
    transcripts: string[],
    images: string[],
    domain: string
): Promise<ExtractionResult> {
    const prompt = domain === 'recovery' ? RECOVERY_PROMPT : CONSTRUCTION_PROMPT;

    try {
        // Build user message content
        const contentParts: any[] = [];

        // Add text
        let textContent = text;
        if (transcripts.length > 0) {
            textContent += `\n\n[VOICE TRANSCRIPTS]:\n${transcripts.join('\n')}`;
        }
        contentParts.push({ type: 'text', text: textContent });

        // Add images for vision analysis
        // Resolve redirects first since Groq vision doesn't follow 307s from Twilio
        for (const imageUrl of images.slice(0, 3)) { // Limit to 3 images
            try {
                // Follow redirect to get final URL
                const finalUrl = await resolveImageUrl(imageUrl);
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: finalUrl }
                });
            } catch (error) {
                console.error(`[EXTRACTION] Failed to resolve image URL: ${imageUrl}`, error);
            }
        }

        const messages: any[] = [
            { role: 'system', content: prompt },
            { role: 'user', content: contentParts },
        ];

        // Use vision model if images provided
        const model = images.length > 0
            ? 'meta-llama/llama-4-scout-17b-16e-instruct'
            : 'llama-3.3-70b-versatile';

        console.log(`[EXTRACTION] Using model: ${model} (${images.length} images)`);

        const completion = await getGroq().chat.completions.create({
            model,
            messages,
            temperature: 0.1,  // Low temperature for strict JSON output
            response_format: { type: 'json_object' },
        });

        const rawResponse = completion.choices[0]?.message?.content || '{}';
        let extracted: any;

        try {
            extracted = JSON.parse(rawResponse);
        } catch (parseError) {
            // Auto-repair: Try to extract JSON from response
            console.warn('[EXTRACTION] JSON parse failed, attempting repair...');
            const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    extracted = JSON.parse(jsonMatch[0]);
                    console.log('[EXTRACTION] JSON repair successful');
                } catch {
                    // Final fallback: Ask Groq to fix the JSON
                    console.warn('[EXTRACTION] Repair failed, requesting LLM fix...');
                    try {
                        const fixCompletion = await getGroq().chat.completions.create({
                            model: 'llama-3.1-8b-instant',
                            messages: [
                                { role: 'user', content: `You generated invalid JSON. Fix this and return ONLY valid JSON:\n\n${rawResponse}` }
                            ],
                            temperature: 0,
                            max_tokens: 1000,
                        });
                        const fixedResponse = fixCompletion.choices[0]?.message?.content || '{}';
                        const fixedMatch = fixedResponse.match(/\{[\s\S]*\}/);
                        extracted = fixedMatch ? JSON.parse(fixedMatch[0]) : {};
                    } catch {
                        console.error('[EXTRACTION] LLM fix also failed, using defaults');
                        extracted = {};
                    }
                }
            } else {
                extracted = {};
            }
        }

        return {
            domain: extracted.domain || domain,
            intent: extracted.intent || 'unknown',
            projectName: extracted.projectName || null,
            isProjectClear: extracted.isProjectClear || false,
            clarityScore: extracted.clarityScore || 0.5,
            summary: extracted.summary || text.slice(0, 100),

            // Consistency
            isConsistent: extracted.isConsistent !== false, // default true
            inconsistencyReason: extracted.inconsistencyReason || null,

            // Construction fields
            workType: extracted.workType,
            hoursWorked: extracted.hoursWorked !== undefined && extracted.hoursWorked !== null ? Number(extracted.hoursWorked) : undefined,
            workersCount: extracted.workersCount,
            materialsUsed: extracted.materialsUsed,
            location: extracted.location,

            // Recovery fields
            damageType: extracted.damageType,
            affectedArea: extracted.affectedArea,
            urgency: extracted.urgency,
            recoveryAction: extracted.recoveryAction,
            damageDescription: extracted.damageDescription,
        };
    } catch (error) {
        console.error('[extractMessageInfo] Error:', error);
        return {
            domain,
            intent: 'unknown',
            projectName: null,
            isProjectClear: false,
            clarityScore: 0.3,
            summary: text.slice(0, 100),
            isConsistent: true,
            inconsistencyReason: null,
        };
    }
}
