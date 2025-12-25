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
 * Send welcome message to new user
 * Note: Twilio doesn't support VCard data URIs in MediaUrl
 * VCard would need to be hosted at a publicly accessible URL
 */
export async function sendVCard(toNumber: string, message: string): Promise<void> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromWhatsApp = process.env.TWILIO_FROM_WHATSAPP;

    if (!accountSid || !authToken || !fromWhatsApp) {
        console.error('[WELCOME] Missing Twilio credentials');
        return;
    }

    try {
        // Include contact info in text since VCard data URIs aren't supported
        const fullMessage = `${message}

📞 Save this number: +1 (202) 953-6899
👤 Contact name: Jentyx Field

(Add to your contacts so you recognize future messages!)`;

        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: `whatsapp:${toNumber}`,
                From: fromWhatsApp,
                Body: fullMessage,
            }),
        });

        const data = await response.json() as any;

        if (!response.ok) {
            console.error('[WELCOME] Twilio API Error:', data);
            throw new Error(data.message || 'Twilio API error');
        }

        console.log(`[WELCOME] ✅ Message sent to ${toNumber} | SID: ${data.sid}`);
    } catch (error) {
        console.error('[WELCOME] Failed to send:', error);
        throw error;
    }
}
