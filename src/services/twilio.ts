import { MessageSource } from '../queue/types.js';

// Twilio credentials (lazy load)
let twilioClient: any = null;

interface TwilioConfig {
    accountSid: string;
    authToken: string;
    fromNumber: string;       // For SMS
    fromWhatsApp: string;     // For WhatsApp (e.g., "whatsapp:+12029536899")
    templates: {
        confirmAll: { en?: string; es?: string };
        selectProject: { en?: string; es?: string };
    };
}

function getConfig(): TwilioConfig {
    return {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        fromNumber: process.env.TWILIO_FROM_NUMBER || '',
        fromWhatsApp: process.env.TWILIO_FROM_WHATSAPP || 'whatsapp:+14155238886',
        templates: {
            confirmAll: {
                en: process.env.WHATSAPP_TEMPLATE_CONFIRM_ALL_EN,
                es: process.env.WHATSAPP_TEMPLATE_CONFIRM_ALL_ES,
            },
            selectProject: {
                en: process.env.WHATSAPP_TEMPLATE_SELECT_PROJECT_EN,
                es: process.env.WHATSAPP_TEMPLATE_SELECT_PROJECT_ES,
            },
        },
    };
}

/**
 * Send a message via Twilio (SMS or WhatsApp based on source)
 */
export async function sendTwilioMessage(
    to: string,
    body: string,
    source: MessageSource,
    mediaUrl?: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
    const config = getConfig();

    const toNumber = source === 'whatsapp' ? `whatsapp:${to}` : to;
    const fromNumber = source === 'whatsapp' ? config.fromWhatsApp : config.fromNumber;

    if (!config.accountSid || !config.authToken) {
        console.warn('[Twilio] Missing credentials - message not sent');
        if (process.env.NODE_ENV !== 'production') {
            console.log('\n📱 [TWILIO MOCK FALLBACK] 📥 Message would be sent to:', toNumber);
            console.log('💬 Body:\n', body);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return { success: true, sid: 'mock_sid_' + Math.random().toString(36).substring(7) };
        }
        return { success: false, error: 'Missing Twilio credentials' };
    }

    if (!fromNumber) {
        console.warn(`[Twilio] Missing ${source} from number`);
        if (process.env.NODE_ENV !== 'production') {
            console.log('\n📱 [TWILIO MOCK FALLBACK] 📥 Message would be sent to:', toNumber);
            console.log('💬 Body:\n', body);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return { success: true, sid: 'mock_sid_' + Math.random().toString(36).substring(7) };
        }
        return { success: false, error: `Missing ${source} from number` };
    }

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

        const params = new URLSearchParams({
            To: toNumber,
            From: fromNumber,
            Body: body,
        });

        if (mediaUrl) {
            // params.append('MediaUrl', mediaUrl);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        const data = await response.json() as any;
        
        if (!response.ok) {
            console.error('[Twilio] API Error:', data);
            if (process.env.NODE_ENV !== 'production') {
                console.log('\n📱 [TWILIO MOCK FALLBACK] 📥 Message would be sent to:', toNumber);
                console.log('💬 Body:\n', body);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                return { success: true, sid: 'mock_sid_' + Math.random().toString(36).substring(7) };
            }
            return { success: false, error: data.message || 'Twilio API error' };
        }

        console.log(`[Twilio] ✅ Message sent to ${toNumber} | SID: ${data.sid}${mediaUrl ? ' (with media)' : ''}`);
        return { success: true, sid: data.sid };
    } catch (error) {
        console.error('[Twilio] Send error:', error);
        if (process.env.NODE_ENV !== 'production') {
            console.log('\n📱 [TWILIO MOCK FALLBACK] 📥 Message would be sent to:', toNumber);
            console.log('💬 Body:\n', body);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return { success: true, sid: 'mock_sid_' + Math.random().toString(36).substring(7) };
        }
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Send WhatsApp interactive message with reply buttons
 */
export async function sendConfirmButtons(
    to: string,
    workType: string,
    hours: number,
    project: string,
    source: MessageSource,
    language: 'en' | 'es' = 'en'
): Promise<{ success: boolean; sid?: string; error?: string }> {
    const config = getConfig();

    if (!config.accountSid || !config.authToken) {
        console.warn('[Twilio] Missing credentials');
        return { success: false, error: 'Missing Twilio credentials' };
    }

    // Get template for user's language
    const templateSid = config.templates.confirmAll[language];
    
    // Fallback to text if template not configured for this language
    if (!templateSid) {
        console.warn(`[Twilio] No interactive template for language: ${language}, using text`);
        const text = language === 'es' 
            ? `${workType} por ${hours}h en ${project}. ¿Correcto? (S/N)`
            : `${workType} for ${hours}h at ${project}. Correct? (Y/N)`;
        return sendTwilioMessage(to, text, source);
    }

    const toNumber = source === 'whatsapp' ? `whatsapp:${to}` : to;
    const fromNumber = source === 'whatsapp' ? config.fromWhatsApp : config.fromNumber;

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

        const params = new URLSearchParams({
            To: toNumber,
            From: fromNumber,
            ContentSid: templateSid,
            ContentVariables: JSON.stringify({
                "1": workType,
                "2": hours.toString(),
                "3": project
            })
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        const data = await response.json() as any;
        
        if (!response.ok) {
            console.error('[Twilio] Interactive message error:', data);
            const text = language === 'es'
                ? `${workType} por ${hours}h en ${project}. ¿Correcto? (S/N)`
                : `${workType} for ${hours}h at ${project}. Correct? (Y/N)`;
            return sendTwilioMessage(to, text, source);
        }

        console.log(`[Twilio] ✅ Interactive button message sent (${language}) | SID: ${data.sid}`);
        return { success: true, sid: data.sid };
    } catch (error) {
        console.error('[Twilio] Interactive message error:', error);
        const text = language === 'es'
            ? `${workType} por ${hours}h en ${project}. ¿Correcto? (S/N)`
            : `${workType} for ${hours}h at ${project}. Correct? (Y/N)`;
        return sendTwilioMessage(to, text, source);
    }
}

/**
 * Send WhatsApp interactive list message for project selection
 */
export async function sendProjectList(
    to: string,
    workType: string,
    hours: number,
    projects: {id: number, name: string}[],
    source: MessageSource,
    language: 'en' | 'es' = 'en'
): Promise<{ success: boolean; sid?: string; error?: string }> {
    const config = getConfig();

    if (!config.accountSid || !config.authToken) {
        return { success: false, error: 'Missing Twilio credentials' };
    }

    const templateSid = config.templates.selectProject[language];

    // Fallback to text if template not configured or too many projects
    if (!templateSid || projects.length > 10) {
        console.warn(`[Twilio] Using text list (no template for ${language} or >10 projects)`);
        const projectList = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
        const text = language === 'es'
            ? `${workType} por ${hours}h.\n\n${projectList}\n\n¿Cuál?`
            : `${workType} for ${hours}h.\n\n${projectList}\n\nWhich one?`;
        return sendTwilioMessage(to, text, source);
    }

    const toNumber = source === 'whatsapp' ? `whatsapp:${to}` : to;
    const fromNumber = source === 'whatsapp' ? config.fromWhatsApp : config.fromNumber;

    try {
        const url = `https://api.twilio.com/2010-04-01/Messages.json`;

        const listItems = projects.slice(0, 10).map(p => ({
            id: p.id.toString(),
            title: p.name.substring(0, 24),
            description: p.name.length > 24 ? p.name : undefined
        }));

        const params = new URLSearchParams({
            To: toNumber,
            From: fromNumber,
            ContentSid: templateSid,
            ContentVariables: JSON.stringify({
                "1": workType,
                "2": hours.toString(),
                "list_items": listItems
            })
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        const data = await response.json() as any;
        
        if (!response.ok) {
            console.error('[Twilio] List message error:', data);
            const projectList = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
            const text = language === 'es'
                ? `${workType} por ${hours}h.\n\n${projectList}\n\n¿Cuál?`
                : `${workType} for ${hours}h.\n\n${projectList}\n\nWhich one?`;
            return sendTwilioMessage(to, text, source);
        }

        console.log(`[Twilio] ✅ Interactive list message sent (${language}) | SID: ${data.sid}`);
        return { success: true, sid: data.sid };
    } catch (error) {
        console.error('[Twilio] List message error:', error);
        const projectList = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
        const text = language === 'es'
            ? `${workType} por ${hours}h.\n\n${projectList}\n\n¿Cuál?`
            : `${workType} for ${hours}h.\n\n${projectList}\n\nWhich one?`;
        return sendTwilioMessage(to, text, source);
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

    if (aiResult?.reply_message) {
        return `${aiResult.reply_message}\n\n📋 *Ticket #${ticketId}*\n`;
    }

    return `${emoji} *Ticket #${ticketId}*\n logged.\n💰 Value: $${revenue.toFixed(2)}`;
}
