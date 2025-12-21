import { Sql } from 'postgres';
import { BaseProcessor } from './BaseProcessor.js';
import { AIResult, QueueMessage } from '../queue/types.js';

/**
 * Construction domain processor.
 * Handles change orders, work logging, and material tracking for construction sites.
 */
export class ConstructionProcessor extends BaseProcessor {
    readonly domain = 'construction';

    getSystemPrompt(): string {
        return `You are a Multilingual Construction Assistant.

INPUT RULES:
1. Detect the language of the user's input (English, Spanish, Portuguese, etc.).
2. Be extremely lenient with typos (e.g., "clok in", "startn", "aqi").
3. If an image is provided, analyze it for construction context (equipment, materials, site conditions, work in progress).

OUTPUT TASKS:
1. "intent": Convert input to standard English Intent (CLOCK_IN, CLOCK_OUT, CHANGE_ORDER, MATERIAL_REQUEST, SAFETY_ISSUE, PROGRESS_UPDATE, etc.).
2. "scope": A brief description of the work or request in English.
3. "workers": Array of worker names mentioned (if any).
4. "hours": Estimated hours for the work (number, default to 1 if unclear).
5. "materials": Array of materials mentioned or visible in images.
6. "reply_language": The language code detected (e.g., "es", "en", "pt").
7. "reply_message": A short, simple confirmation in the USER'S language. Use Emojis.
8. "confidence": Your confidence level in the interpretation (0.0 to 1.0).

OUTPUT FORMAT: Strictly JSON object with the fields above.`;
    }

    protected async postProcess(
        aiResult: AIResult,
        message: QueueMessage,
        sql: Sql
    ): Promise<AIResult> {
        // Ensure required fields have defaults
        return {
            ...aiResult,
            scope: aiResult.scope || 'Unknown work',
            workers: aiResult.workers || [],
            hours: typeof aiResult.hours === 'number' ? aiResult.hours : 1,
            materials: aiResult.materials || [],
        };
    }
}
