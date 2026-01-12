#!/usr/bin/env npx tsx

/**
 * Clean up Twilio media from test messages
 * Deletes MMS/WhatsApp messages with media attachments (last 100)
 * ⚠️ DESTRUCTIVE: Use only on test accounts
 * Usage: npx tsx scripts/cleanup-twilio-media.ts
 */

import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function cleanUpTestingMedia() {
    console.log("🚀 Starting media flush...\n");

    // 1. Fetch the last 100 messages
    const messages = await client.messages.list({ limit: 100 });
    let deletedCount = 0;
    let errorCount = 0;

    for (const record of messages) {
        // 2. Check if it has media (MMS or WhatsApp images/voice)
        if (parseInt(record.numMedia) > 0) {
            try {
                await client.messages(record.sid).remove();
                console.log(`✅ Deleted Message + Media: ${record.sid}`);
                deletedCount++;
            } catch (err: any) {
                console.error(`❌ Failed to delete ${record.sid}:`, err.message);
                errorCount++;
            }
        }
    }

    console.log("\n🏁 Cleanup complete.");
    console.log(`   Deleted: ${deletedCount}`);
    console.log(`   Errors: ${errorCount}`);
}

cleanUpTestingMedia();
