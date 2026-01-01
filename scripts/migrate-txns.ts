import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

async function migrate() {
    const sql = postgres(process.env.DATABASE_URL!);

    try {
        const migration = readFileSync('drizzle/0005_simplify_txns.sql', 'utf-8');
        await sql.unsafe(migration);
        console.log('✅ Migration applied successfully');
    } catch (error) {
        console.error('Migration error:', error);
        throw error;
    }

    await sql.end();
}

migrate();
