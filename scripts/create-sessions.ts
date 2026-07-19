#!/usr/bin/env npx tsx

/**
 * Create sessions table for user authentication
 * Creates table with user_id FK and expiry tracking
 * Usage: npx tsx scripts/create-sessions.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
}

const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');

if (isLocal) {
    try {
        const url = new URL(DATABASE_URL);
        const dbName = url.pathname.substring(1);
        if (dbName && dbName !== 'postgres') {
            url.pathname = '/postgres';
            const tempSql = postgres(url.toString(), { ssl: false });
            const dbExists = await tempSql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
            if (dbExists.length === 0) {
                console.log(`📡 Local database "${dbName}" not found. Creating it...`);
                await tempSql.unsafe(`CREATE DATABASE "${dbName}"`);
                console.log(`✅ Local database "${dbName}" created!`);
            }
            await tempSql.end();
        }
    } catch (e: any) {
        console.warn(`⚠️ Warning while checking local database: ${e.message}`);
    }
}

const sql = postgres(DATABASE_URL, {
    ssl: isLocal ? false : 'require'
});

async function migrate() {
    console.log('🚀 Creating sessions table...');

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at BIGINT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);`;

        console.log('✅ Sessions table created successfully.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await sql.end();
    }
}

migrate();
