/**
 * Consolidated Database Migration Script
 * Run with: npx tsx drizzle/run-migration.ts
 * 
 * This script is idempotent - safe to run multiple times on dev or prod.
 * All changes use IF NOT EXISTS / IF EXISTS patterns.
 */
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

// Detect environment for logging
const dbUrl = process.env.DATABASE_URL || '';
const isDev = dbUrl.includes('jbojgxyqexgcooduavhx');
const envLabel = isDev ? 'DEV' : 'PROD';

async function run() {
    console.log(`🚀 Running migration on ${envLabel} environment...\n`);

    // ========================================================================
    // 1. MEMBERS TABLE EXTENSIONS
    // ========================================================================
    console.log('→ Extending members table...');
    const memberColumns = [
        { name: 'domain', type: "varchar(50) DEFAULT 'construction'" },
        { name: 'language_preference', type: "varchar(10) DEFAULT 'en'" },
        { name: 'last_confirmed_project_id', type: 'integer' },
        { name: 'project_confirmed_at', type: 'timestamp' },
        { name: 'pending_node_id', type: 'integer' },
    ];
    for (const col of memberColumns) {
        await addColumn('members', col.name, col.type);
    }
    console.log('  ✅ OK\n');

    // ========================================================================
    // 2. PROJECTS TABLE
    // ========================================================================
    console.log('→ Creating projects table...');
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS "projects" (
                "id" serial PRIMARY KEY NOT NULL,
                "node_id" integer NOT NULL,
                "name" text NOT NULL,
                "is_active" boolean DEFAULT true,
                "is_inbox" boolean DEFAULT false,
                "aliases" text,
                "created_at" timestamp DEFAULT now()
            )
        `;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // Add is_inbox column if table already existed without it
    await addColumn('projects', 'is_inbox', 'boolean DEFAULT false');
    await addColumn('projects', 'aliases', 'text');

    // ========================================================================
    // 3. BUCKETS TABLE
    // ========================================================================
    console.log('→ Creating/updating buckets table...');
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS "buckets" (
                "id" serial PRIMARY KEY NOT NULL,
                "member_id" integer NOT NULL,
                "node_id" integer NOT NULL,
                "source" varchar(20) NOT NULL,
                "from_phone" varchar(20) NOT NULL,
                "raw_text" text,
                "image_url" text,
                "audio_url" text,
                "domain" varchar(50),
                "intent" varchar(50),
                "project_id" integer,
                "project_name_raw" text,
                "status" varchar(20) DEFAULT 'pending' NOT NULL,
                "ai_response" text,
                "created_at" timestamp DEFAULT now(),
                "updated_at" timestamp DEFAULT now()
            )
        `;
        console.log('  ✅ Table created/exists\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // Add extended bucket columns (for multi-media, AI processing)
    console.log('→ Adding extended bucket columns...');
    const bucketColumns = [
        { name: 'summary', type: 'text' },
        { name: 'extraction_json', type: 'text' },
        { name: 'extracted_data', type: 'text' },
        { name: 'potential_change', type: 'text' },
        { name: 'validation_attempts', type: 'integer DEFAULT 0' },
        { name: 'image_urls', type: 'text' },
        { name: 'audio_urls', type: 'text' },
        { name: 'transcripts', type: 'text' },
        { name: 'message_sids', type: 'text' },
        { name: 'suspected_project_name', type: 'text' },
        { name: 'conversation_history', type: 'text' },
        { name: 'clarity_score', type: 'integer' },
    ];
    for (const col of bucketColumns) {
        await addColumn('buckets', col.name, col.type);
    }
    console.log('  ✅ OK\n');

    // ========================================================================
    // 4. TXNS TABLE EXTENSIONS
    // ========================================================================
    console.log('→ Extending txns table...');
    const txnColumns = [
        { name: 'bucket_id', type: 'integer' },
        { name: 'project_id', type: 'integer' },
        { name: 'scope_description', type: 'text' },
        { name: 'evidence', type: 'text' },
    ];
    for (const col of txnColumns) {
        await addColumn('txns', col.name, col.type);
    }
    console.log('  ✅ OK\n');

    // ========================================================================
    // 5. HOLDING TANK TABLE
    // ========================================================================
    console.log('→ Creating holding_tank table...');
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS "holding_tank" (
                "id" serial PRIMARY KEY NOT NULL,
                "from_phone" varchar(20) NOT NULL,
                "source" varchar(20) NOT NULL,
                "raw_text" text,
                "image_urls" text,
                "audio_urls" text,
                "message_sid" text,
                "status" varchar(20) DEFAULT 'pending' NOT NULL,
                "created_at" timestamp DEFAULT now()
            )
        `;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // ========================================================================
    // 6. USERS TABLE (for web UI auth)
    // ========================================================================
    console.log('→ Creating users table...');
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS "users" (
                "id" serial PRIMARY KEY NOT NULL,
                "email" varchar(255) NOT NULL UNIQUE,
                "password_hash" varchar(255) NOT NULL,
                "role" varchar(20) DEFAULT 'OM' NOT NULL,
                "node_id" integer,
                "name" varchar(255),
                "created_at" timestamp DEFAULT now()
            )
        `;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // ========================================================================
    // 7. FOREIGN KEYS
    // ========================================================================
    console.log('→ Adding foreign keys...');
    const fks = [
        { name: 'projects_node_id_nodes_id_fk', table: 'projects', col: 'node_id', ref: 'nodes' },
        { name: 'buckets_member_id_members_id_fk', table: 'buckets', col: 'member_id', ref: 'members' },
        { name: 'buckets_node_id_nodes_id_fk', table: 'buckets', col: 'node_id', ref: 'nodes' },
        { name: 'buckets_project_id_projects_id_fk', table: 'buckets', col: 'project_id', ref: 'projects' },
        { name: 'txns_bucket_id_buckets_id_fk', table: 'txns', col: 'bucket_id', ref: 'buckets' },
        { name: 'txns_project_id_projects_id_fk', table: 'txns', col: 'project_id', ref: 'projects' },
        { name: 'members_last_confirmed_project_id_fk', table: 'members', col: 'last_confirmed_project_id', ref: 'projects' },
        { name: 'users_node_id_nodes_id_fk', table: 'users', col: 'node_id', ref: 'nodes' },
    ];

    for (const fk of fks) {
        try {
            await sql.unsafe(`
                ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.name}"
                FOREIGN KEY ("${fk.col}") REFERENCES "public"."${fk.ref}"("id")
                ON DELETE no action ON UPDATE no action
            `);
            console.log(`  ✅ ${fk.name}`);
        } catch (e: any) {
            if (e.message.includes('already exists')) {
                console.log(`  ⏭️ ${fk.name} (exists)`);
            } else {
                console.log(`  ⚠️ ${fk.name}: ${e.message}`);
            }
        }
    }

    await sql.end();
    console.log(`\n🎉 Migration complete on ${envLabel}!`);
}

// Helper: Add column if not exists (suppresses NOTICE messages)
async function addColumn(table: string, column: string, type: string) {
    try {
        await sql.unsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${type}`);
    } catch (e: any) {
        console.log(`  ⚠️ ${table}.${column}: ${e.message}`);
    }
}

run();
