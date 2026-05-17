import { Sql } from 'postgres';
import { randomUUID } from 'crypto';
import { Bucket, BucketStatus, validateBucket, closeBucket, completeBucket, failBucket } from './bucketService.js';
import { copyTwilioMedia } from './mediaStorage.js';
import { transcribeAudio } from './transcribe.js';
import { extractTransactionFromBucket } from './transactionService.js';
import { sendTwilioMessage } from './twilio.js';
import { t, getLang } from './i18n.js';

export async function processBucketMessage(sql: Sql, bucketId: number, messageSid: string) {
    console.log(`[ProcessingService] 🛠️ Starting processing for bucket #${bucketId}`);

    try {
        // 1. Get the bucket
        const buckets = await sql`SELECT * FROM buckets WHERE id = ${bucketId}`;
        if (buckets.length === 0) {
            throw new Error(`Bucket #${bucketId} not found`);
        }
        const bucket = buckets[0] as Bucket;

        // 2. Extract media from current message
        // Note: In a real scenario, we might want to store raw Twilio media URLs in buckets
        // and process them here. For now, assume processMedia already happened or happens here.
        // Let's refactor to handle it here.

        // Prepare member for translations
        const members = await sql`SELECT * FROM members WHERE id = ${bucket.member_id}`;
        const member = members[0];
        const lang = getLang(member);

        // 3. VALIDATE TICKET COMPLETENESS (includes AI extraction)
        const validation = await validateBucket(sql, bucket);
        console.log(`[ProcessingService] Validation for #${bucketId}: complete=${validation.isComplete}`);

        // 4. GENERATE RESPONSE & UPDATE STATUS
        let responseMsg = '';

        if (validation.isComplete) {
            // Check if we need to auto-submit or ask for project (logic from webhook.ts)
            // For simplicity in this refactor, let's follow the 'submitted' flow
            await closeBucket(sql, bucket.id);

            // Extract transaction
            await extractTransactionFromBucket(sql, bucket.id);

            // Fetch running totals
            const todayRows = await sql`SELECT SUM(time) as total FROM txns WHERE user_id = ${bucket.member_id} AND created_at >= CURRENT_DATE`;
            const weekRows = await sql`SELECT SUM(time) as total FROM txns WHERE user_id = ${bucket.member_id} AND created_at >= date_trunc('week', CURRENT_DATE)`;
            const today = parseFloat(todayRows[0]?.total || '0').toFixed(1).replace(/\.0$/, '');
            const week = parseFloat(weekRows[0]?.total || '0').toFixed(1).replace(/\.0$/, '');
            const runningTotals = `\n\n⏱️ Today: ${today}h | This week: ${week}h`;

            const summaryLine = validation.summary ? `"${validation.summary}"\n\n` : '';
            responseMsg = `${t(lang, 'ticket_submitted', { id: bucket.id })}\n\n${summaryLine}${t(lang, 'logged_to', { project: 'Inbox' })}${runningTotals}`;

            await completeBucket(sql, bucket.id);
        } else {
            // Build feedback message
            responseMsg = `Ticket #${bucket.id}: `;
            if (validation.questions.length > 0) {
                responseMsg += validation.questions[0];
            } else {
                responseMsg += t(lang, 'send_details') || 'Please add more details.';
            }
        }

        // 5. SEND WHATSAPP/SMS RESPONSE
        await sendTwilioMessage(bucket.from_phone, responseMsg, bucket.source);
        console.log(`[ProcessingService] ✅ Sent reply to ${bucket.from_phone}: ${responseMsg.slice(0, 50)}...`);

    } catch (error) {
        console.error(`[ProcessingService] ❌ Failed to process bucket #${bucketId}:`, error);
        await failBucket(sql, bucketId, (error as Error).message);
    }
}
