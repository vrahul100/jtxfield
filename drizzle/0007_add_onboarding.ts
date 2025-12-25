import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function run() {
    console.log('🚀 Adding onboarding fields to members...\n');

    // Add status column
    console.log('→ Adding status column...');
    try {
        await sql`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'pending'`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // Add onboarded_at column
    console.log('→ Adding onboarded_at column...');
    try {
        await sql`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "onboarded_at" timestamp`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // Add invited_by column
    console.log('→ Adding invited_by column...');
    try {
        await sql`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "invited_by" integer REFERENCES members(id)`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // Update existing members to 'active'
    console.log('→ Setting existing members to active...');
    try {
        await sql`UPDATE members SET status = 'active' WHERE status IS NULL`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    await sql.end();
    console.log('🎉 Migration complete!');
}

run();
