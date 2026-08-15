import Groq from 'groq-sdk';
import { DomainProcessor, QueueMessage, ProcessorResult, AIResult } from '../queue/types.js';
import { Sql } from 'postgres';
import { transcribeAudio } from '../services/transcribe.js';

// Lazy-initialize to ensure dotenv has loaded
let groq: Groq | null = null;
function getGroq(): Groq {
    if (!groq) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groq;
}

/**
 * Abstract base processor with shared logic for all domains.
 * Handles common tasks like image URL resolution and AI API calls.
 */
export abstract class BaseProcessor implements DomainProcessor {
    abstract readonly domain: string;
    abstract getSystemPrompt(): string;

    /**
     * Process a queued message. Override in subclasses for domain-specific logic.
     */
    async process(message: QueueMessage, sql: Sql): Promise<ProcessorResult> {
        try {
            console.log(`[${this.domain}Processor] Processing message ${message.messageId}`);

            // 1. Build the user content (multimodal)
            const userContent = await this.buildUserContent(message);

            // 2. Call AI with domain-specific prompt
            const aiResult = await this.callAI(userContent);

            // 3. Post-process (domain-specific)
            const processedResult = await this.postProcess(aiResult, message, sql);

            return {
                success: true,
                aiResult: processedResult,
            };
        } catch (error) {
            console.error(`[${this.domain}Processor] Error:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Build multimodal content for AI (text + optional image)
     */
    protected async buildUserContent(message: QueueMessage): Promise<any[]> {
        const content: any[] = [
            { type: 'text', text: `From: ${message.fromPhone}. Message: "${message.textBody}"` }
        ];

        if (message.imageUrl) {
            try {
                // Resolve redirect (Twilio -> S3)
                const response = await fetch(message.imageUrl, { method: 'HEAD', redirect: 'follow' });
                const finalUrl = response.url;
                console.log(`[${this.domain}Processor] Resolved Image URL: ${finalUrl}`);

                content.push({
                    type: 'image_url',
                    image_url: { url: finalUrl }
                });
            } catch (error) {
                console.error(`[${this.domain}Processor] Failed to resolve image URL:`, error);
                // Fallback to original URL
                content.push({
                    type: 'image_url',
                    image_url: { url: message.imageUrl }
                });
            }
        }

        return content;
    }

    /**
     * Call Groq AI with the domain's system prompt
     */
    protected async callAI(userContent: any[]): Promise<AIResult> {
        const completion = await getGroq().chat.completions.create({
            messages: [
                { role: 'system', content: this.getSystemPrompt() },
                { role: 'user', content: userContent }
            ],
            model: process.env.GENERAL_MODEL ,
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        const content = completion.choices[0]?.message?.content || '{}';
        return JSON.parse(content);
    }

    /**
     * Post-process the AI result. Override for domain-specific logic.
     */
    protected async postProcess(
        aiResult: AIResult,
        message: QueueMessage,
        sql: Sql
    ): Promise<AIResult> {
        return aiResult;
    }
}
