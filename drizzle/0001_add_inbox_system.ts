import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function run() {
    console.log('🚀 Adding Inbox project system support...\n');

    // 1. Add columns to projects table
    console.log('→ Adding aliases and is_inbox to projects...');
    try {
        await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "aliases" text`;
        await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "is_inbox" boolean DEFAULT false`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 2. Add column to buckets table
    console.log('→ Adding suspected_project_name to buckets...');
    try {
        await sql`ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "suspected_project_name" text`;
        console.log('  ✅ OK\n');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    // 3. Create Inbox projects for all existing nodes (if they don't exist)
    console.log('→ Creating Inbox projects for all nodes...');
    try {
        const result = await sql`
            INSERT INTO projects (node_id, name, is_inbox, is_active)
            SELECT id, 'Inbox', true, true FROM nodes
            WHERE NOT EXISTS (
                SELECT 1 FROM projects WHERE node_id = nodes.id AND is_inbox = true
            )
            RETURNING id, node_id, name
        `;

        if (result.length > 0) {
            console.log(`  ✅ Created ${result.length} Inbox project(s)`);
            result.forEach((p: any) => console.log(`     • Node ${p.node_id}: ${p.name} (ID: ${p.id})`));
        } else {
            console.log('  ⏭️  All nodes already have Inbox projects');
        }
        console.log('');
    } catch (e: any) {
        console.log('  ⚠️', e.message, '\n');
    }

    await sql.end();
    console.log('🎉 Migration complete!');
}

run();
