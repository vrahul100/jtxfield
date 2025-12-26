import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function run() {
    console.log('🚀 Adding users table for web authentication...\n');

    // 1. Create users table
    console.log('→ Creating users table...');
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS "users" (
                "id" serial PRIMARY KEY NOT NULL,
                "email" varchar(255) NOT NULL UNIQUE,
                "password_hash" text NOT NULL,
                "role" varchar(10) NOT NULL,
                "node_id" integer REFERENCES "nodes"("id"),
                "full_name" varchar(100),
                "is_active" boolean DEFAULT true,
                "created_at" timestamp DEFAULT now(),
                "updated_at" timestamp DEFAULT now()
            )
        `;
        console.log('  ✅ Users table created\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 2. Update members table for approval workflow
    console.log('→ Updating members table for approval workflow...');
    try {
        await sql`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "approved_by" integer REFERENCES "users"("id")`;
        console.log('  ✅ Added approved_by column to members\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    await sql.end();
    console.log('🎉 Migration complete!');
}

run();
