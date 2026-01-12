#!/usr/bin/env npx tsx

/**
 * Add conversation_history JSONB column to buckets table
 * Stores the Q&A thread between the bot and the worker
 * Usage: npx tsx scripts/add-conversation-history.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
    const sql = postgres(process.env.DATABASE_URL!);

    try {
        await sql`ALTER TABLE buckets ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'`;
        console.log('✅ Added conversation_history column to buckets table');
    } catch (error: any) {
        if (error.code === '42701') {
            console.log('Column already exists');
        } else {
            console.error('Migration error:', error);
        }
    }

    await sql.end();
}

migrate();
