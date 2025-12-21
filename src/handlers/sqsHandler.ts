import { SQSEvent, SQSHandler, Context } from 'aws-lambda';
import postgres from 'postgres';
import { QueueMessage } from '../queue/types.js';
import { getProcessorRegistry } from '../processors/ProcessorRegistry.js';
import { sendTwilioMessage, formatReplyMessage } from '../services/twilio.js';

/**
 * AWS Lambda handler for SQS queue messages.
 * This is triggered by SQS in production instead of using a polling worker.
 */
export const handler: SQSHandler = async (event: SQSEvent, context: Context) => {
    console.log(`[SQSHandler] Processing ${event.Records.length} message(s)`);

    const sql = postgres(process.env.DATABASE_URL!);
    const registry = getProcessorRegistry();

    const results: { messageId: string; success: boolean; error?: string }[] = [];

    for (const record of event.Records) {
        console.log(`[SQSHandler] Processing record: ${record.messageId}`);

        try {
            const message: QueueMessage = JSON.parse(record.body);

            // 1. Get the appropriate processor
            const processor = registry.get(message.domain);
            console.log(`[SQSHandler] Using ${processor.domain} processor [${message.source}]`);

            // 2. Process with domain-specific logic
            const result = await processor.process(message, sql);

            if (!result.success) {
                throw new Error(result.error || 'Processing failed');
            }

            // 3. Calculate revenue (for construction domain)
            let revenue = 0;
            if (message.domain === 'construction' && result.aiResult) {
                const rates = await sql`SELECT default_hourly_rate FROM companies WHERE id = ${message.companyId}`;
                if (rates.length > 0) {
                    const rate = parseFloat(rates[0].default_hourly_rate);
                    const workers = result.aiResult.workers || [];
                    const hours = result.aiResult.hours || 1;
                    revenue = hours * workers.length * rate;
                }
            }

            // 4. Save to database
            const ticket = await sql`
                INSERT INTO change_orders (company_id, user_id, raw_text, scope_description, estimated_revenue, status)
                VALUES (${message.companyId}, ${message.userId}, ${message.textBody}, ${result.aiResult?.scope || ''}, ${revenue}, 'PROCESSED')
                RETURNING id
            `;

            console.log(`[SQSHandler] ✅ Ticket #${ticket[0].id} created | Revenue: $${revenue}`);

            // 5. Send reply to user via Twilio
            const replyMessage = formatReplyMessage(result.aiResult, ticket[0].id, revenue);
            await sendTwilioMessage(message.fromPhone, replyMessage, message.source);

            results.push({ messageId: record.messageId, success: true });

        } catch (error) {
            console.error(`[SQSHandler] ❌ Failed to process message ${record.messageId}:`, error);
            results.push({
                messageId: record.messageId,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            // Re-throw to trigger SQS retry
            throw error;
        }
    }

    // Close the database connection
    await sql.end();

    console.log('[SQSHandler] Batch complete:', results);
};

