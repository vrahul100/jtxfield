import Groq from 'groq-sdk';

// Lazy-initialize to ensure dotenv has loaded
let groq: Groq | null = null;
function getGroq(): Groq {
    if (!groq) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groq;
}

export interface ExtractionResult {
    domain: 'construction' | 'recovery' | string;
    intent: 'log' | 'recovery' | 'status' | 'unknown';
    projectName: string | null;        // extracted project name
    isProjectClear: boolean;           // confidence that we know which project
    clarityScore: number;              // 0-1 semantic clarity
    summary: string;                   // brief summary of the message
    suggestedAction: string;           // what should happen next
}

const EXTRACTION_PROMPT = `You are an AI assistant that extracts structured information from work-related messages.

Analyze the message and extract:
1. intent: What is the user trying to do?
   - "log" = recording work done, time, materials, progress
   - "recovery" = reporting damage, requesting insurance/recovery action
   - "status" = asking about status of something
   - "unknown" = unclear intent

2. projectName: The project/job this is about (e.g., "Acme Tower", "123 Main St renovation")
   - Extract the project name if clearly mentioned
   - Set to null if not mentioned or unclear

3. isProjectClear: true if you're confident which project this is about, false if ambiguous

4. clarityScore: 0.0 to 1.0 rating of how semantically clear and actionable the message is

5. summary: Brief 1-line summary of the message content

6. suggestedAction: What should happen next ("process", "ask_project", "ask_clarification")

Return JSON only. Example:
{
  "domain": "construction",
  "intent": "log",
  "projectName": "Acme Tower",
  "isProjectClear": true,
  "clarityScore": 0.9,
  "summary": "Completed electrical wiring on floor 3",
  "suggestedAction": "process"
}`;

/**
 * Extract structured information from a message using AI
 */
export async function extractMessageInfo(
    text: string,
    memberDomain: string = 'construction',
    imageUrl?: string | null
): Promise<ExtractionResult> {
    const userContent: any[] = [
        { type: 'text', text: `Message: "${text}"` }
    ];

    if (imageUrl) {
        try {
            const response = await fetch(imageUrl, { method: 'HEAD', redirect: 'follow' });
            const finalUrl = response.url;
            userContent.push({
                type: 'image_url',
                image_url: { url: finalUrl }
            });
        } catch (error) {
            console.error('[Extraction] Failed to resolve image URL:', error);
        }
    }

    try {
        const completion = await getGroq().chat.completions.create({
            messages: [
                { role: 'system', content: EXTRACTION_PROMPT },
                { role: 'user', content: userContent }
            ],
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        const content = completion.choices[0]?.message?.content || '{}';
        const result = JSON.parse(content) as Partial<ExtractionResult>;

        return {
            domain: result.domain || memberDomain,
            intent: result.intent || 'unknown',
            projectName: result.projectName || null,
            isProjectClear: result.isProjectClear ?? false,
            clarityScore: result.clarityScore ?? 0.5,
            summary: result.summary || text.slice(0, 100),
            suggestedAction: result.suggestedAction || 'ask_clarification',
        };
    } catch (error) {
        console.error('[Extraction] AI call failed:', error);
        return {
            domain: memberDomain,
            intent: 'unknown',
            projectName: null,
            isProjectClear: false,
            clarityScore: 0,
            summary: text.slice(0, 100),
            suggestedAction: 'ask_clarification',
        };
    }
}

/**
 * Find matching projects based on extracted name
 */
export async function findMatchingProjects(
    sql: any,
    nodeId: number,
    extractedName: string | null
): Promise<{ id: number; name: string }[]> {
    if (!extractedName) {
        // Return all active projects for the node
        const projects = await sql`
            SELECT id, name FROM projects 
            WHERE node_id = ${nodeId} AND is_active = true
            ORDER BY name
            LIMIT 10
        `;
        return projects;
    }

    // Try to find matching projects (case-insensitive partial match)
    const projects = await sql`
        SELECT id, name FROM projects 
        WHERE node_id = ${nodeId} 
          AND is_active = true
          AND LOWER(name) LIKE ${`%${extractedName.toLowerCase()}%`}
        ORDER BY name
        LIMIT 10
    `;

    // If no matches, return all active projects
    if (projects.length === 0) {
        const allProjects = await sql`
            SELECT id, name FROM projects 
            WHERE node_id = ${nodeId} AND is_active = true
            ORDER BY name
            LIMIT 10
        `;
        return allProjects;
    }

    return projects;
}
