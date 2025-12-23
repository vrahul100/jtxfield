import postgres from 'postgres';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function run() {
    console.log('🚀 Running migration...\n');

    // 1. Add domain column to members
    console.log('→ Adding domain column to members...');
    try {
        await sql`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "domain" varchar(50) DEFAULT 'construction'`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 2. Create projects table
    console.log('→ Creating projects table...');
    try {
        await sql`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" serial PRIMARY KEY NOT NULL,
        "node_id" integer NOT NULL,
        "name" text NOT NULL,
        "is_active" boolean DEFAULT true,
        "created_at" timestamp DEFAULT now()
      )
    `;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 3. Create buckets table
    console.log('→ Creating buckets table...');
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
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 4. Add new columns to txns
    console.log('→ Adding bucket_id and project_id to txns...');
    try {
        await sql`ALTER TABLE "txns" ADD COLUMN IF NOT EXISTS "bucket_id" integer`;
        await sql`ALTER TABLE "txns" ADD COLUMN IF NOT EXISTS "project_id" integer`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 5. Add foreign keys
    console.log('→ Adding foreign keys...');
    const fks = [
        { name: 'projects_node_id_nodes_id_fk', table: 'projects', col: 'node_id', ref: 'nodes' },
        { name: 'buckets_member_id_members_id_fk', table: 'buckets', col: 'member_id', ref: 'members' },
        { name: 'buckets_node_id_nodes_id_fk', table: 'buckets', col: 'node_id', ref: 'nodes' },
        { name: 'buckets_project_id_projects_id_fk', table: 'buckets', col: 'project_id', ref: 'projects' },
        { name: 'txns_bucket_id_buckets_id_fk', table: 'txns', col: 'bucket_id', ref: 'buckets' },
        { name: 'txns_project_id_projects_id_fk', table: 'txns', col: 'project_id', ref: 'projects' },
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
                console.log(`  ⏭️ ${fk.name} (already exists)`);
            } else {
                console.log(`  ⚠️ ${fk.name}: ${e.message}`);
            }
        }
    }

    await sql.end();
    console.log('\n🎉 Migration complete!');
}

run();
