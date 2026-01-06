import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

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
            await sql.unsafe(sqlContent);
            console.log(`  ✅ OK`);
        } catch (e: any) {
            if (e.message.includes('already exists')) {
                console.log(`  ⏭️ Already applied`);
            } else {
                console.log(`  ⚠️ ${e.message}`);
            }
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
