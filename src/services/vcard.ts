import { sendTwilioMessage } from './twilio.js';

/**
 * Generate a VCard (contact card) for Jentyx
 * Note: Kept for potential future use when we can host VCard files
 */
export function generateVCard(): string {
    return `BEGIN:VCARD
VERSION:3.0
FN:Jentyx Field 
TEL;TYPE=CELL:+12029536899
ORG:Jentyx
TITLE:Your AI Work Assistant
EMAIL:info@jentyx.com
URL:https://jentyx.com
NOTE:Send photos and descriptions of your work. I'll track it automatically!
END:VCARD`;
}

/**
 * Send welcome message with contact info
 */
export async function sendVCard(toNumber: string, message: string): Promise<void> {
    const fullMessage = `${message}

📞 Save this number: +1 (202) 953-6899
👤 Contact name: Jentyx Field

(Add to your contacts so you recognize future messages!)`;

    await sendTwilioMessage(toNumber, fullMessage, 'whatsapp');
}
