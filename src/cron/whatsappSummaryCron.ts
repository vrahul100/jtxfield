import { Sql } from 'postgres';
import { sendTwilioMessage } from '../services/twilio.js';
import { formatTemplateD } from '../services/fastIntakeService.js';

/**
 * Dispatches batch WhatsApp notifications to Basic tier workers.
 * Scheduled to run at 12:00 PM (Mid-Day Check) and 5:00 PM (Shift Summary - Template D).
 */
export async function runBatchSummaryCron(sql: Sql, type: 'midday' | 'end_of_shift'): Promise<{
    sentCount: number;
    errors: any[];
}> {
    console.log(`[BatchCron] ⏰ Running WhatsApp summary cron (${type})...`);

    let sentCount = 0;
    const errors: any[] = [];

    try {
        // Find all active members with logged activity today
        const members = await sql`
            SELECT id, phone_number, full_name, pending_item_count, pending_ticket_count, language_preference
            FROM members
            WHERE status = 'active'
              AND (last_inbound_at >= CURRENT_DATE OR pending_item_count > 0)
        `;

        console.log(`[BatchCron] Found ${members.length} active members to summarize`);

        for (const member of members) {
            const isSpanish = member.language_preference === 'es';
            const items = member.pending_item_count || 1;
            const tickets = member.pending_ticket_count || 1;

            let summaryMessage = '';

            if (type === 'midday') {
                summaryMessage = isSpanish
                    ? `📋 *Revisión de Mediodía*: Recibimos ${items} elementos de tu parte esta mañana. Todos registrados.`
                    : `📋 *Mid-Day Check*: Received ${items} items from you this morning. All logged.`;
            } else {
                // Query day stats for Template D: eod_daily_summary_wrap
                const stats = await sql`
                    SELECT 
                        COUNT(*)::int as total_tasks,
                        COALESCE(SUM(t.time), 0)::numeric as total_hours,
                        COALESCE(MAX(p.name), 'General Project') as active_site
                    FROM txns t
                    LEFT JOIN projects p ON p.id = t.project_id
                    WHERE t.user_id = ${member.id}
                      AND t.created_at >= CURRENT_DATE
                `;

                const totalTasks = stats[0]?.total_tasks || tickets || items;
                const totalHours = Number(stats[0]?.total_hours) || (items * 4);
                const activeSite = stats[0]?.active_site || 'General Project';

                summaryMessage = formatTemplateD({
                    memberName: member.full_name || 'Worker',
                    totalTasks,
                    totalHours,
                    activeSite,
                    language: isSpanish ? 'es' : 'en',
                });
            }

            try {
                await sendTwilioMessage(member.phone_number, summaryMessage, 'whatsapp');
                sentCount++;

                // Reset pending counts after successful delivery
                await sql`
                    UPDATE members 
                    SET pending_item_count = 0,
                        pending_ticket_count = 0,
                        last_summary_sent_at = NOW()
                    WHERE id = ${member.id}
                `;

                console.log(`[BatchCron] Sent ${type} summary to member #${member.id} (${member.phone_number})`);
            } catch (err: any) {
                console.error(`[BatchCron] Failed to send to member #${member.id}:`, err);
                errors.push({ memberId: member.id, error: err?.message || err });
            }
        }
    } catch (err: any) {
        console.error(`[BatchCron] Error executing ${type} batch summary:`, err);
        errors.push({ error: err?.message || err });
    }

    return { sentCount, errors };
}

/**
 * Initialize timer-based scheduled triggers for 12:00 PM and 5:00 PM
 */
export function initWhatsAppSummaryScheduler(sql: Sql) {
    console.log('[BatchCron] Initializing WhatsApp summary scheduler for Basic tier...');

    const checkAndTrigger = () => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Trigger at 12:00 PM (between 12:00 and 12:01)
        if (hours === 12 && minutes === 0) {
            runBatchSummaryCron(sql, 'midday').catch(console.error);
        }

        // Trigger at 5:00 PM / 17:00 (between 17:00 and 17:01)
        if (hours === 17 && minutes === 0) {
            runBatchSummaryCron(sql, 'end_of_shift').catch(console.error);
        }
    };

    // Check every 60 seconds
    const interval = setInterval(checkAndTrigger, 60 * 1000);
    return interval;
}
