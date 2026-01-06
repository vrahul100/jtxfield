import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

async function debug() {
    console.log('🔍 Debugging Supabase Trigger Setup...\n');

    try {
        // 1. Check if trigger exists
        console.log('1. Checking if trigger exists...');
        const triggers = await sql`
            SELECT trigger_name, event_manipulation, action_statement 
            FROM information_schema.triggers 
            WHERE trigger_name = 'process_bucket_trigger'
        `;
        console.log('   Triggers found:', triggers.length);
        if (triggers.length > 0) {
            console.log('   ✅ Trigger exists');
        } else {
            console.log('   ❌ Trigger NOT found!');
        }

        // 2. Check if trigger function exists
        console.log('\n2. Checking if trigger function exists...');
        const functions = await sql`
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_name = 'notify_bucket_processing'
        `;
        console.log('   Functions found:', functions.length);
        if (functions.length > 0) {
            console.log('   ✅ Function exists');
        } else {
            console.log('   ❌ Function NOT found!');
        }

        // 3. Check pg_net extension
        console.log('\n3. Checking pg_net extension...');
        const extensions = await sql`
            SELECT extname, extversion 
            FROM pg_extension 
            WHERE extname = 'pg_net'
        `;
        if (extensions.length > 0) {
            console.log('   ✅ pg_net installed:', extensions[0]);
        } else {
            console.log('   ❌ pg_net NOT installed!');
        }

        // 4. Check recent buckets
        console.log('\n4. Checking recent buckets...');
        const buckets = await sql`
            SELECT id, status, updated_at 
            FROM buckets 
            ORDER BY id DESC 
            LIMIT 5
        `;
        console.log('   Recent buckets:', buckets.map(b => `#${b.id}: ${b.status}`));

        // 5. Check pg_net response table
        console.log('\n5. Checking pg_net response table...');
        const responses = await sql`
            SELECT id, status_code, error_msg, timed_out, created 
            FROM net._http_response 
            ORDER BY created DESC 
            LIMIT 10
        `;
        console.log('   HTTP responses:', responses.length);
        responses.forEach(r => {
            console.log(`   - ID ${r.id}: status=${r.status_code}, error=${r.error_msg}, timed_out=${r.timed_out}`);
        });

        // 6. Test trigger manually
        console.log('\n6. Testing trigger manually...');
        console.log('   Creating a test bucket and updating it...');

        // First, get a member
        const members = await sql`SELECT id, node_id FROM members LIMIT 1`;
        if (members.length === 0) {
            console.log('   ❌ No members found!');
            return;
        }

        // Get inbox project
        const projects = await sql`SELECT id FROM projects WHERE node_id = ${members[0].node_id} AND is_inbox = true LIMIT 1`;
        const projectId = projects.length > 0 ? projects[0].id : null;

        // Create test bucket with 'open' status
        const inserted = await sql`
            INSERT INTO buckets (member_id, node_id, project_id, source, from_phone, raw_text, status)
            VALUES (${members[0].id}, ${members[0].node_id}, ${projectId}, 'whatsapp', '+0000000000', 'TRIGGER TEST', 'open')
            RETURNING id
        `;
        console.log(`   Created test bucket #${inserted[0].id}`);

        // Update to pending_processing
        await sql`
            UPDATE buckets 
            SET status = 'pending_processing', updated_at = NOW()
            WHERE id = ${inserted[0].id}
        `;
        console.log(`   Updated bucket #${inserted[0].id} to pending_processing`);

        // Wait a moment for pg_net
        console.log('   Waiting 3 seconds for pg_net to process...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check responses again
        const newResponses = await sql`
            SELECT id, status_code, error_msg, timed_out, content, created 
            FROM net._http_response 
            ORDER BY created DESC 
            LIMIT 5
        `;
        console.log('\n7. New HTTP responses after trigger:');
        newResponses.forEach(r => {
            console.log(`   - ID ${r.id}: status=${r.status_code}, error=${r.error_msg}`);
            if (r.content) {
                console.log(`     Content: ${r.content.substring(0, 200)}`);
            }
        });

        // Cleanup
        await sql`DELETE FROM buckets WHERE id = ${inserted[0].id}`;
        console.log(`\n   🧹 Cleaned up test bucket #${inserted[0].id}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await sql.end();
    }
}

debug();
