import { sendTwilioMessage } from './twilio.js';

// Jentyx logo for WhatsApp messages
const JENTYX_LOGO_URL = process.env.JENTYX_LOGO_URL || 'https://gevdamoroboqxpacbdkk.supabase.co/storage/v1/object/public/media/images/logo.png';

/**
 * Generate a VCard (contact card) for Jentyx
 * Note: Kept for potential future use when we can host VCard files
 */
export function generateVCard(): string {
    return `BEGIN:VCARD
VERSION:3.0
FN:Jentyx 
TEL;TYPE=CELL:+12029536899
ORG:Jentyx
TITLE:Your AI Work Assistant
EMAIL:info@jentyx.com
URL:https://jentyx.com
NOTE:Send photos and descriptions of your work. I'll track it automatically!
END:VCARD`;
}

/**
 * Send welcome message with contact info and logo
 */
export async function sendVCard(toNumber: string, message: string): Promise<void> {
    const fullMessage = `${message}

📞 Save this number: +1 (202) 953-6899
👤 Contact name: Jentyx

(Add to your contacts so you recognize future messages!)`;

    await sendTwilioMessage(toNumber, fullMessage, 'whatsapp', JENTYX_LOGO_URL);
}
