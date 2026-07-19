#!/usr/bin/env npx tsx

/**
 * Sync schema to Supabase by running all migrations
 * Runs SQL migrations in order and adds missing columns
 * Usage: npx tsx scripts/sync-supabase-schema.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL is not set in environment or .env file');
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

async function runAllMigrations() {
    console.log('🚀 Running ALL migrations on Supabase...\n');

    // List of SQL migrations to run in order
    const sqlMigrations = [
        '0000_careless_centennial.sql',
        '0001_lonely_triton.sql',
        '0003_add_pending_node_id.sql',
        '0004_add_conversation_history.sql',
        '0005_simplify_txns.sql',
        '0006_add_extracted_data.sql',
        '0007_add_clarity_score.sql',
        '0008_add_summary.sql',
    ];

    for (const file of sqlMigrations) {
        console.log(`→ Running ${file}...`);
        try {
            const sqlContent = readFileSync(`drizzle/${file}`, 'utf-8');
            const statements = sqlContent.split('--> statement-breakpoint');
            
            for (const stmt of statements) {
                const trimmed = stmt.trim();
                if (!trimmed) continue;
                
                try {
                    await sql.unsafe(trimmed);
                } catch (e: any) {
                    if (
                        e.message.includes('already exists') || 
                        e.message.includes('already a member') || 
                        e.message.includes('does not exist') ||
                        e.message.includes('duplicate')
                    ) {
                        // Safe to ignore for idempotency
                    } else {
                        console.log(`  ⚠️ Statement error: ${e.message}`);
                    }
                }
            }
            console.log(`  ✅ OK`);
        } catch (e: any) {
            console.log(`  ⚠️ ${e.message}`);
        }
    }

    // Run the main migration runner for TypeScript migrations
    console.log('\n→ Running domain/project/bucket migrations...');
    try {
        // Add domain column
        await sql`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "domain" varchar(50) DEFAULT 'construction'`;

        // Create projects table
        await sql`
            CREATE TABLE IF NOT EXISTS "projects" (
                "id" serial PRIMARY KEY NOT NULL,
                "node_id" integer NOT NULL,
                "name" text NOT NULL,
                "is_active" boolean DEFAULT true,
                "created_at" timestamp DEFAULT now()
            )
        `;

        // Add missing bucket columns
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "extracted_data" JSONB`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "clarity_score" integer`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "summary" text`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "conversation_history" JSONB`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "validation_errors" JSONB`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "transcripts" JSONB`;

        console.log('  ✅ OK');
    } catch (e: any) {
        console.log(`  ⚠️ ${e.message}`);
    }

    await sql.end();
    console.log('\n🎉 All migrations complete!');
}

runAllMigrations();
