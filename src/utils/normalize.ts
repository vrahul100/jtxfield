import { MessageSource, NormalizedMessage } from '../queue/types.js';

/**
 * Normalize a Twilio webhook payload into a consistent format.
 * Works for both SMS and WhatsApp messages.
 */
export function normalizeTwilioPayload(body: any): NormalizedMessage {
    const fromRaw = body.From || '';
    const isWhatsApp = fromRaw.startsWith('whatsapp:');

    // Clean phone number (e.g., "whatsapp:+1234" -> "+1234")
    const sender = isWhatsApp ? fromRaw.split(':')[1] : fromRaw;
    const source: MessageSource = isWhatsApp ? 'whatsapp' : 'sms';

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
        text: body.Body || '',
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
