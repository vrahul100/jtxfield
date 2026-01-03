import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!);

async function addSummaryColumn() {
    console.log('Adding summary column to buckets table...');

    try {
        await sql`
            ALTER TABLE buckets ADD COLUMN IF NOT EXISTS summary TEXT
        `;

        console.log('✅ Successfully added summary column');
    } catch (error) {
        console.error('❌ Error adding summary column:', error);
        throw error;
    } finally {
        await sql.end();
    }
}

addSummaryColumn();
