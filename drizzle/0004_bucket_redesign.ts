import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function run() {
    console.log('🚀 Running migration for bucket redesign...\n');

    // 1. Add columns to members
    console.log('→ Adding last_confirmed_project to members...');
    try {
        await sql`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "last_confirmed_project_id" integer`;
        await sql`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "project_confirmed_at" timestamp`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 2. Update buckets table - add new columns
    console.log('→ Updating buckets table...');
    try {
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "image_urls" text`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "audio_urls" text`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "transcripts" text`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "validation_errors" text`;
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "message_sids" text`;
        // Rename old columns if they exist
        await sql`ALTER TABLE "buckets" RENAME COLUMN "image_url" TO "image_url_old"`.catch(() => { });
        await sql`ALTER TABLE "buckets" RENAME COLUMN "audio_url" TO "audio_url_old"`.catch(() => { });
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 3. Update existing bucket statuses from 'pending' to 'open'
    console.log('→ Updating bucket statuses...');
    try {
        await sql`UPDATE buckets SET status = 'open' WHERE status = 'pending'`;
        await sql`UPDATE buckets SET status = 'closed' WHERE status = 'processing'`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 4. Create holding_tank table
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
        "message_sid" varchar(50),
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "created_at" timestamp DEFAULT now()
      )
    `;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 5. Add FK for last_confirmed_project
    console.log('→ Adding foreign key for last_confirmed_project...');
    try {
        await sql`
      ALTER TABLE "members" ADD CONSTRAINT "members_last_confirmed_project_id_projects_id_fk"
      FOREIGN KEY ("last_confirmed_project_id") REFERENCES "public"."projects"("id")
      ON DELETE SET NULL ON UPDATE no action
    `;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        if (e.message.includes('already exists')) {
            console.log('  ⏭️ Already exists\n');
        } else {
            console.log('  ⚠️', e.message, '\n');
        }
    }

    await sql.end();
    console.log('🎉 Migration complete!');
}

run();
