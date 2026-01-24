import { MessageSource, NormalizedMessage } from '../queue/types.js';

/**
 * Normalize a Twilio webhook payload into a consistent format.
 * Works for both SMS and WhatsApp messages.
 * Handles WhatsApp interactive message responses (buttons and lists).
 */
export function normalizeTwilioPayload(body: any): NormalizedMessage {
    const fromRaw = body.From || '';
    const isWhatsApp = fromRaw.startsWith('whatsapp:');

    // Clean phone number (e.g., "whatsapp:+1234" -> "+1234")
    const sender = isWhatsApp ? fromRaw.split(':')[1] : fromRaw;
    const source: MessageSource = isWhatsApp ? 'whatsapp' : 'sms';

    // Parse WhatsApp interactive message responses
    let text = body.Body || '';
    
    // Check for button reply (user clicked a button)
    if (body.ButtonPayload) {
        console.log(`[Webhook] Button click detected: ${body.ButtonPayload}`);
        text = body.ButtonPayload; // e.g., "yes" or "no"
        // Also append button title for context if available
        if (body.ButtonText) {
            console.log(`[Webhook] Button text: ${body.ButtonText}`);
        }
    }
    
    // Check for list reply (user selected from list)
    if (body.ListId) {
        console.log(`[Webhook] List selection detected: ${body.ListId}`);
        text = body.ListId; // Will be the project ID as string
        // Also log the title they selected
        if (body.ListTitle) {
            console.log(`[Webhook] List title: ${body.ListTitle}`);
        }
    }

    // Gather Media (Twilio uses MediaUrl0, MediaUrl1, etc.)
    const numMedia = parseInt(body.NumMedia || '0', 10);
    const media: Array<{ url: string; contentType: string }> = [];

    for (let i = 0; i < numMedia; i++) {
        const url = body[`MediaUrl${i}`];
        const contentType = body[`MediaContentType${i}`];
        if (url && contentType) {
            media.push({ url, contentType });
        }
    }

    return {
        messageId: body.MessageSid || body.SmsSid || '',
        sender,
        source,
        text,
        media,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Check if the message source is WhatsApp
 */
export function isWhatsAppMessage(body: any): boolean {
    const from = body.From || '';
    return from.startsWith('whatsapp:');
}

/**
 * Get clean phone number without whatsapp: prefix
 */
export function getCleanPhoneNumber(from: string): string {
    if (from.startsWith('whatsapp:')) {
        return from.split(':')[1];
    }
    return from;
}
