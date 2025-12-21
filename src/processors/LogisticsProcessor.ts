import { Sql } from 'postgres';
import { BaseProcessor } from './BaseProcessor.js';
import { AIResult, QueueMessage } from '../queue/types.js';

/**
 * Logistics domain processor.
 * Handles delivery confirmations, route updates, and shipment tracking.
 */
export class LogisticsProcessor extends BaseProcessor {
    readonly domain = 'logistics';

    getSystemPrompt(): string {
        return `You are a Multilingual Logistics Assistant.

INPUT RULES:
1. Detect the language of the user's input (English, Spanish, Portuguese, etc.).
2. Be lenient with typos and shorthand common in delivery communications.
3. If an image is provided, analyze it for logistics context (proof of delivery, package condition, vehicle, warehouse, etc.).

OUTPUT TASKS:
1. "intent": Convert input to standard English Intent (DELIVERY_COMPLETE, PICKUP_COMPLETE, ROUTE_UPDATE, DELAY_REPORT, DAMAGE_REPORT, INVENTORY_CHECK, etc.).
2. "scope": A brief description of the delivery or logistics event in English.
3. "tracking_ids": Array of tracking numbers or order IDs mentioned (if any).
4. "location": Current location or delivery address if mentioned.
5. "status": Shipment status (PENDING, IN_TRANSIT, DELIVERED, DELAYED, RETURNED, DAMAGED).
6. "items": Array of items or packages mentioned.
7. "reply_language": The language code detected (e.g., "es", "en", "pt").
8. "reply_message": A short, simple confirmation in the USER'S language. Use Emojis.
9. "confidence": Your confidence level in the interpretation (0.0 to 1.0).

OUTPUT FORMAT: Strictly JSON object with the fields above.`;
    }

    protected async postProcess(
        aiResult: AIResult,
        message: QueueMessage,
        sql: Sql
    ): Promise<AIResult> {
        // Map logistics-specific fields to the generic AIResult format
        const extendedResult = aiResult as any;

        return {
            scope: extendedResult.scope || 'Unknown logistics event',
            workers: [],  // Logistics doesn't typically track workers the same way
            hours: 0,     // Not applicable for logistics
            materials: extendedResult.items || [],
            // Include logistics-specific fields
            tracking_ids: extendedResult.tracking_ids || [],
            location: extendedResult.location || null,
            status: extendedResult.status || 'PENDING',
            intent: extendedResult.intent || 'UNKNOWN',
            reply_language: extendedResult.reply_language || 'en',
            reply_message: extendedResult.reply_message || 'Received',
            confidence: extendedResult.confidence || 0.5,
        };
    }
}
