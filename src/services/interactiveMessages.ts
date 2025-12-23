import { MessageSource } from '../queue/types.js';

interface TwilioConfig {
    accountSid: string;
    authToken: string;
    fromWhatsApp: string;
}

function getConfig(): TwilioConfig {
    return {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        fromWhatsApp: process.env.TWILIO_FROM_WHATSAPP || 'whatsapp:+14155238886',
    };
}

interface Project {
    id: number;
    name: string;
}

/**
 * Send WhatsApp interactive list message for project selection.
 * WhatsApp supports list messages with up to 10 options.
 */
export async function sendProjectSelectionMessage(
    to: string,
    bucketId: number,
    projects: Project[],
    messageText: string = "Which project is this for?"
): Promise<{ success: boolean; sid?: string; error?: string }> {
    const config = getConfig();

    if (!config.accountSid || !config.authToken) {
        console.warn('[InteractiveMessages] Missing Twilio credentials');
        return { success: false, error: 'Missing Twilio credentials' };
    }

    const toNumber = `whatsapp:${to}`;

    // Build the interactive list message content template
    // Using Twilio Content API format for WhatsApp list messages
    const sections = [{
        title: "Projects",
        rows: projects.slice(0, 10).map((p, idx) => ({
            id: `project_${p.id}_bucket_${bucketId}`,
            title: p.name.slice(0, 24), // WhatsApp limit: 24 chars
            description: `Select ${p.name}`
        }))
    }];

    // Add "Create New" option
    sections[0].rows.push({
        id: `new_project_bucket_${bucketId}`,
        title: "➕ New Project",
        description: "Create a new project"
    });

    try {
        // For now, send as a simple text message with numbered options
        // (Full interactive messages require ContentSID templates)
        const projectList = projects.slice(0, 9).map((p, i) =>
            `${i + 1}. ${p.name}`
        ).join('\n');

        const body = `📋 ${messageText}\n\n${projectList}\n\n0. ➕ Create new project\n\nReply with the number of your choice.`;

        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: toNumber,
                From: config.fromWhatsApp,
                Body: body,
            }),
        });

        const data = await response.json() as any;

        if (!response.ok) {
            console.error('[InteractiveMessages] API Error:', data);
            return { success: false, error: data.message || 'Twilio API error' };
        }

        console.log(`[InteractiveMessages] ✅ Project selection sent to ${toNumber} | SID: ${data.sid}`);
        return { success: true, sid: data.sid };
    } catch (error) {
        console.error('[InteractiveMessages] Send error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Parse a project selection response from the user.
 * Returns the project index (1-based) or 0 for "new project", or null if not a selection.
 */
export function parseProjectSelectionResponse(text: string): number | null {
    const trimmed = text.trim();

    // Check if it's a single number
    if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10);
    }

    return null;
}

/**
 * Send a confirmation message after project is selected
 */
export async function sendProjectConfirmation(
    to: string,
    projectName: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
    const config = getConfig();

    if (!config.accountSid || !config.authToken) {
        return { success: false, error: 'Missing Twilio credentials' };
    }

    const toNumber = `whatsapp:${to}`;
    const body = `✅ Got it! Logging to project: ${projectName}\n\n📥 Processing your message...`;

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: toNumber,
                From: config.fromWhatsApp,
                Body: body,
            }),
        });

        const data = await response.json() as any;

        if (!response.ok) {
            return { success: false, error: data.message || 'Twilio API error' };
        }

        return { success: true, sid: data.sid };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Ask user to enter a new project name
 */
export async function sendNewProjectPrompt(
    to: string,
    bucketId: number
): Promise<{ success: boolean; sid?: string; error?: string }> {
    const config = getConfig();

    if (!config.accountSid || !config.authToken) {
        return { success: false, error: 'Missing Twilio credentials' };
    }

    const toNumber = `whatsapp:${to}`;
    const body = `📝 What would you like to name the new project?\n\nJust type the project name and send it.`;

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: toNumber,
                From: config.fromWhatsApp,
                Body: body,
            }),
        });

        const data = await response.json() as any;

        if (!response.ok) {
            return { success: false, error: data.message || 'Twilio API error' };
        }

        return { success: true, sid: data.sid };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
