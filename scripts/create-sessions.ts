import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function migrate() {
    console.log('🚀 Creating sessions table...');

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at BIGINT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);`;

        console.log('✅ Sessions table created successfully.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await sql.end();
    }
}

migrate();
