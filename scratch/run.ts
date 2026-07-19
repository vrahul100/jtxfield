import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const directUrl = process.env.DATABASE_URL;
if (!directUrl) {
    throw new Error('DATABASE_URL is not defined in the environment variables.');
}
const sql = postgres(directUrl, { ssl: 'require', prepare: false });

async function run() {
    console.log('Running migration...');
    try {
        await sql`ALTER TABLE "buckets" ADD COLUMN "co_packet_id" integer`;
        console.log('Done!');
    } catch (e: any) {
        if (e.message.includes('already exists')) {
            console.log('Column already exists, ignoring.');
        } else {
            console.error(e);
        }
    }
    process.exit(0);
}
run();
