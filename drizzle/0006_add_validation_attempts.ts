import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function run() {
    console.log('🚀 Adding validation_attempts to buckets...\n');

    try {
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "validation_attempts" integer DEFAULT 0`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    await sql.end();
    console.log('🎉 Migration complete!');
}

run();
