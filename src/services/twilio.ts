import { MessageSource } from '../queue/types.js';

// Twilio credentials (lazy load)
let twilioClient: any = null;

interface TwilioConfig {
    accountSid: string;
    authToken: string;
    fromNumber: string;       // For SMS
    fromWhatsApp: string;     // For WhatsApp (e.g., "whatsapp:+12029536899")
}

function getConfig(): TwilioConfig {
    return {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        fromNumber: process.env.TWILIO_FROM_NUMBER || '',
        fromWhatsApp: process.env.TWILIO_FROM_WHATSAPP || 'whatsapp:+14155238886',
    };
}

/**
 * Send a message via Twilio (SMS or WhatsApp based on source)
 */
export async function sendTwilioMessage(
    to: string,
    body: string,
    source: MessageSource
): Promise<{ success: boolean; sid?: string; error?: string }> {
    const config = getConfig();

    if (!config.accountSid || !config.authToken) {
        console.warn('[Twilio] Missing credentials - message not sent');
        return { success: false, error: 'Missing Twilio credentials' };
    }

    // Format the "to" and "from" based on source
    const toNumber = source === 'whatsapp' ? `whatsapp:${to}` : to;
    const fromNumber = source === 'whatsapp' ? config.fromWhatsApp : config.fromNumber;

    if (!fromNumber) {
        console.warn(`[Twilio] Missing ${source} from number`);
        return { success: false, error: `Missing ${source} from number` };
    }

    try {
        // Use fetch to call Twilio API directly (avoids heavy SDK)
        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: toNumber,
                From: fromNumber,
                Body: body,
            }),
        });

        const data = await response.json() as any;

        if (!response.ok) {
            console.error('[Twilio] API Error:', data);
            return { success: false, error: data.message || 'Twilio API error' };
        }

        console.log(`[Twilio] ✅ Message sent to ${toNumber} | SID: ${data.sid}`);
        return { success: true, sid: data.sid };
    } catch (error) {
        console.error('[Twilio] Send error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Format a reply message based on AI result
 */
export function formatReplyMessage(
    aiResult: any,
    ticketId: number,
    revenue: number
): string {
    const lang = aiResult?.reply_language || 'en';
    const emoji = aiResult?.reply_message ? '' : '✅';

    // Use AI-generated reply if available, otherwise default
    if (aiResult?.reply_message) {
        return `${aiResult.reply_message}\n\n📋 *Ticket #${ticketId}*\n`;
    }

    // Default English response
    return `${emoji} *Ticket #${ticketId}*\n logged.\n💰 Value: $${revenue.toFixed(2)}`;
}
