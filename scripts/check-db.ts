import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString, { max: 1 });

async function main() {
    const buckets = await sql`
        SELECT id, member_id, status, hours, summary, project_id, audio_urls, transcripts, raw_text, created_at 
        FROM buckets 
        ORDER BY id DESC 
        LIMIT 5
    `;
    console.log('--- RECENT BUCKETS ---');
    console.log(JSON.stringify(buckets, null, 2));

    const projects = await sql`
        SELECT id, node_id, name, is_inbox, is_active 
        FROM projects
    `;
    console.log('--- PROJECTS ---');
    console.log(JSON.stringify(projects, null, 2));

    const members = await sql`
        SELECT id, full_name, phone_number, last_confirmed_project_id, project_confirmed_at 
        FROM members
    `;
    console.log('--- MEMBERS ---');
    console.log(JSON.stringify(members, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
