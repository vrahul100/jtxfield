#!/usr/bin/env npx tsx

/**
 * Add clarity_score column to buckets table
 * Runs migration: drizzle/0007_add_clarity_score.sql
 * Usage: npx tsx scripts/add-clarity-score.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const sql = postgres(process.env.DATABASE_URL || '');

async function runMigration() {
    console.log('Running clarity_score migration...');

    const migrationSQL = readFileSync(join(__dirname, '../drizzle/0007_add_clarity_score.sql'), 'utf-8');
    await sql.unsafe(migrationSQL);

    console.log('✅ Migration complete');
    await sql.end();
}

runMigration().catch(console.error);
