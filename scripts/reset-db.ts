import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function resetDatabase() {
    console.log('🗑️  Dropping all tables...\n');

    try {
        // Drop all tables in the correct order (respecting foreign keys)
        await sql`DROP TABLE IF EXISTS holding_tank CASCADE`;
        await sql`DROP TABLE IF EXISTS rate_cards CASCADE`;
        await sql`DROP TABLE IF EXISTS txns CASCADE`;
        await sql`DROP TABLE IF EXISTS buckets CASCADE`;
        await sql`DROP TABLE IF EXISTS projects CASCADE`;
        await sql`DROP TABLE IF EXISTS members CASCADE`;
        await sql`DROP TABLE IF EXISTS nodes CASCADE`;

        // Also drop the drizzle migration tracking table
        await sql`DROP TABLE IF EXISTS __drizzle_migrations CASCADE`;

        console.log('✅ All tables dropped successfully\n');
    } catch (e: any) {
        console.error('❌ Error dropping tables:', e.message);
        throw e;
    }

    await sql.end();
    console.log('🎉 Database reset complete!');
}

resetDatabase();
