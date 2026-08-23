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

const envLabel = isLocal ? 'LOCAL' : 'PROD';

async function run() {
    console.log(`🚀 Running migration on ${envLabel} environment...\n`);
    console.log('Running migration on: ', DATABASE_URL);
    // ========================================================================
    // 1. MEMBERS TABLE EXTENSIONS
    // ========================================================================
    const memberColumns = [
        { name: 'domain', type: "varchar(50) DEFAULT 'construction'" },
        { name: 'language_preference', type: "varchar(10) DEFAULT 'en'" },
        { name: 'last_confirmed_project_id', type: 'integer' },
        { name: 'project_confirmed_at', type: 'timestamp' },
        { name: 'pending_node_id', type: 'integer' },
        { name: 'last_inbound_at', type: 'timestamptz' },
        { name: 'pending_item_count', type: 'integer DEFAULT 0' },
        { name: 'pending_ticket_count', type: 'integer DEFAULT 0' },
        { name: 'last_summary_sent_at', type: 'timestamptz' },
    ];
    for (const col of memberColumns) {
        await addColumn('members', col.name, col.type);
    }
    try {
        await sql`DROP INDEX IF EXISTS idx_members_basic_pending`;
        await sql`ALTER TABLE members DROP COLUMN IF EXISTS subscription_tier`;
    } catch (e: any) {
        console.log('  ⚠️', e.message);
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
    try {
        await sql`ALTER TABLE "buckets" ALTER COLUMN "status" TYPE varchar(50)`;
    } catch (e: any) {
        console.log('  ⚠️', e.message);
    }
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
        { name: 'type', type: "varchar(30) DEFAULT 'regular'" },
        { name: 'wa_sent_timestamp', type: 'timestamp' },
        { name: 'wa_received_timestamp', type: 'timestamp' },
        { name: 'hours', type: 'numeric(10, 2)' },
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
                "password_hash" text NOT NULL,
                "role" varchar(10) NOT NULL,
                "node_id" integer,
                "full_name" varchar(100),
                "is_active" boolean DEFAULT true,
                "created_at" timestamp DEFAULT now(),
                "updated_at" timestamp DEFAULT now()
            )
        `;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // Migrate existing users table if it was created with old fields (name instead of full_name)
    try {
        await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" varchar(100)`;
        await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true`;
        await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now()`;
    } catch (e: any) {
        console.log('  ⚠️ Users migration warning:', e.message, '\n');
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
