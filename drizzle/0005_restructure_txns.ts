import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function run() {
    console.log('🚀 Updating txns schema...\n');

    // 1. Rename rawText to job
    console.log('→ Renaming raw_text to job...');
    try {
        await sql`ALTER TABLE "txns" RENAME COLUMN "raw_text" TO "job"`.catch(() => { });
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 2. Replace image_url with evidence
    console.log('→ Adding evidence column...');
    try {
        await sql`ALTER TABLE "txns" ADD COLUMN IF NOT EXISTS "evidence" text`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 3. Migrate existing image_url data to evidence (if any exists)
    console.log('→ Migrating existing image_url to evidence...');
    try {
        await sql`
      UPDATE txns 
      SET evidence = json_build_array(image_url)::text
      WHERE image_url IS NOT NULL AND evidence IS NULL
    `;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 4. Drop old image_url column
    console.log('→ Dropping old image_url column...');
    try {
        await sql`ALTER TABLE "txns" DROP COLUMN IF EXISTS "image_url"`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    await sql.end();
    console.log('🎉 Migration complete!');
}

run();
