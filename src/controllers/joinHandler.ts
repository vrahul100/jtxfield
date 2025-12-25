import { Context } from 'hono';
import { Sql } from 'postgres';
import { sendVCard } from '../services/vcard.js';

/**
 * Handle JOIN JTX request - onboard new user
 */
export async function handleJoinRequest(
    c: Context,
    sql: Sql,
    normalized: any,
    body: any
): Promise<Response> {
    console.log(`[JOIN] Request from ${normalized.sender}`);

    // Check if user already exists
    const existing = await sql`
    SELECT * FROM members WHERE phone_number = ${normalized.sender}
  `;

    if (existing.length > 0) {
        // Already registered - resend VCard
        console.log(`[JOIN] User already exists, resending VCard`);
        await sendVCard(normalized.sender, '👋 Welcome back! Save this contact if you haven\'t already.');
        return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    // Create new member with pending status
    await sql`
    INSERT INTO members (phone_number, full_name, status, onboarded_at)
    VALUES (${normalized.sender}, 'New User', 'pending', NOW())
  `;

    console.log(`[JOIN] Created new pending member: ${normalized.sender}`);

    // Send VCard
    const welcomeMessage = `🎉 Welcome to Jentyx!

Save this contact, then your admin will assign you to a project.

Once assigned, just send:
• Photos of your work
• Voice notes describing what you did
• How many hours it took

I'll track everything automatically!`;

    await sendVCard(normalized.sender, welcomeMessage);

    // TODO: Notify admins of new pending user
    // await notifyAdminsNewUser(normalized.sender);

    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
}
