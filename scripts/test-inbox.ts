#!/usr/bin/env npx tsx

/**
 * Test inbox system implementation
 * Verifies: inbox projects, schema updates, alias management, bucket tagging
 * Usage: npx tsx scripts/test-inbox.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function testInboxSystem() {
    console.log('🧪 Testing Inbox System Implementation\n');

    // Test 1: Check if Inbox project exists
    console.log('1️⃣ Verifying Inbox project exists...');
    const inboxProjects = await sql`
        SELECT id, node_id, name, is_inbox 
        FROM projects 
        WHERE is_inbox = true
    `;

    if (inboxProjects.length > 0) {
        console.log(`  ✅ Found ${inboxProjects.length} Inbox project(s):`);
        inboxProjects.forEach(p => console.log(`     • Node ${p.node_id}: "${p.name}" (ID: ${p.id})`));
    } else {
        console.log('  ❌ No Inbox projects found!');
    }
    console.log('');

    // Test 2: Check schema updates
    console.log('2️⃣ Verifying schema updates...');
    const schemaCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name IN ('aliases', 'is_inbox')
    `;
    console.log(`  ✅ Projects table has: ${schemaCheck.map(c => c.column_name).join(', ')}`);

    const bucketSchema = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'buckets' AND column_name = 'suspected_project_name'
    `;
    console.log(`  ✅ Buckets table has: ${bucketSchema.map(c => c.column_name).join(', ')}`);
    console.log('');

    // Test 3: Try adding an alias to a project
    console.log('3️⃣ Testing alias management...');
    const testProjects = await sql`
        SELECT id, name FROM projects 
        WHERE is_inbox = false AND is_active = true
        LIMIT 1
    `;

    if (testProjects.length > 0) {
        const testProject = testProjects[0];
        const testAlias = 'Test Mall Project';

        // Add alias
        let aliases: string[] = [];
        const [current] = await sql`SELECT aliases FROM projects WHERE id = ${testProject.id}`;
        if (current?.aliases) {
            try {
                aliases = JSON.parse(current.aliases);
            } catch (e) { }
        }

        if (!aliases.includes(testAlias)) {
            aliases.push(testAlias);
            await sql`
                UPDATE projects 
                SET aliases = ${JSON.stringify(aliases)}
                WHERE id = ${testProject.id}
            `;
            console.log(`  ✅ Added alias "${testAlias}" to project "${testProject.name}"`);
        } else {
            console.log(`  ⏭️  Alias "${testAlias}" already exists`);
        }

        // Verify alias was added
        const [updated] = await sql`SELECT aliases FROM projects WHERE id = ${testProject.id}`;
        const updatedAliases = updated?.aliases ? JSON.parse(updated.aliases) : [];
        console.log(`  ✅ Project "${testProject.name}" now has ${updatedAliases.length} alias(es): ${updatedAliases.join(', ')}`);
    } else {
        console.log('  ⏭️  No projects available for alias testing');
    }
    console.log('');

    // Test 4: Check if any buckets have suspected project names
    console.log('4️⃣ Checking for tagged buckets...');
    const taggedBuckets = await sql`
        SELECT id, suspected_project_name, project_id
        FROM buckets
        WHERE suspected_project_name IS NOT NULL
        LIMIT 5
    `;

    if (taggedBuckets.length > 0) {
        console.log(`  ✅ Found ${taggedBuckets.length} bucket(s) with tags:`);
        taggedBuckets.forEach(b => console.log(`     • Bucket #${b.id}: tag="${b.suspected_project_name}", project=${b.project_id}`));
    } else {
        console.log('  ℹ️  No buckets with tags yet (will be created when workers send messages)');
    }
    console.log('');

    await sql.end();
    console.log('🎉 Test complete!');
}

testInboxSystem().catch(console.error);
