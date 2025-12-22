import { Sql } from 'postgres';
import { Queue, QueueMessage } from '../queue/types.js';
import { getLocalQueue } from '../queue/LocalQueue.js';
import { getProcessorRegistry } from '../processors/ProcessorRegistry.js';
import { sendTwilioMessage, formatReplyMessage } from '../services/twilio.js';

/**
 * Background worker that processes messages from the local queue.
 * Only used in local development. In production, Lambda handles this.
 */
export class QueueWorker {
    private sql: Sql;
    private queue: Queue;
    private isRunning: boolean = false;
    private pollIntervalMs: number;

    constructor(sql: Sql, pollIntervalMs: number = 1000) {
        this.sql = sql;
        this.queue = getLocalQueue();
        this.pollIntervalMs = pollIntervalMs;
    }

    /**
     * Start the background worker
     */
    start(): void {
        if (this.isRunning) {
            console.log('[QueueWorker] Already running');
            return;
        }

        this.isRunning = true;
        console.log('[QueueWorker] Starting background worker...');
        this.poll();
    }

    /**
     * Stop the background worker
     */
    stop(): void {
        this.isRunning = false;
        console.log('[QueueWorker] Stopped');
    }

    /**
     * Poll the queue for messages
     */
    private async poll(): Promise<void> {
        while (this.isRunning) {
            try {
                const message = await this.queue.dequeue();

                if (message) {
                    await this.processMessage(message);
                }
            } catch (error) {
                console.error('[QueueWorker] Poll error:', error);
            }

            // Wait before next poll
            await this.sleep(this.pollIntervalMs);
        }
    }

    /**
     * Process a single message
     */
    private async processMessage(message: QueueMessage): Promise<void> {
        console.log(`[QueueWorker] Processing message ${message.messageId} [${message.source}] for domain: ${message.domain}`);

        try {
            // 1. Get the appropriate processor
            const registry = getProcessorRegistry();
            const processor = registry.get(message.domain);

            // 2. Process with domain-specific logic
            const result = await processor.process(message, this.sql);

            if (!result.success) {
                throw new Error(result.error || 'Processing failed');
            }

            // 3. Calculate revenue (for construction domain)
            let revenue = 0;
            if (message.domain === 'construction' && result.aiResult) {
                const rates = await this.sql`SELECT default_hourly_rate FROM nodes WHERE id = ${message.companyId}`;
                if (rates.length > 0) {
                    const rate = parseFloat(rates[0].default_hourly_rate);
                    const workers = result.aiResult.workers || [];
                    const hours = result.aiResult.hours || 1;
                    revenue = hours * workers.length * rate;
                }
            }

            // 4. Save to database
            const ticket = await this.sql`
                INSERT INTO txns (company_id, user_id, raw_text, scope_description, estimated_revenue, status)
                VALUES (${message.companyId}, ${message.userId}, ${message.textBody}, ${result.aiResult?.scope || ''}, ${revenue}, 'PROCESSED')
                RETURNING id
            `;

            console.log(`[QueueWorker] ✅ Ticket #${ticket[0].id} created | Revenue: $${revenue}`);

            // 5. Send reply to user via Twilio
            const replyMessage = formatReplyMessage(result.aiResult, ticket[0].id, revenue);
            await sendTwilioMessage(message.fromPhone, replyMessage, message.source);

            // 6. Acknowledge successful processing
            await this.queue.acknowledge(message.messageId);

        } catch (error) {
            console.error(`[QueueWorker] ❌ Failed to process message ${message.messageId}:`, error);
            await this.queue.fail(message.messageId, error as Error);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

