import postgres from 'postgres';
import dotenv from 'dotenv';
import { createUser } from '../src/services/auth.js';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function seedDatabase() {
    console.log('🌱 Seeding database with test data...\n');

    try {
        // 1. Create Nodes
        console.log('→ Creating nodes...');
        const [node1] = await sql`
            INSERT INTO nodes (name, default_hourly_rate)
            VALUES ('Downtown Construction', '95.00')
            ON CONFLICT DO NOTHING
            RETURNING id
        `;

        const [node2] = await sql`
            INSERT INTO nodes (name, default_hourly_rate)
            VALUES ('Westside Builders', '85.00')
            ON CONFLICT DO NOTHING
            RETURNING id
        `;

        const nodeId1 = node1?.id || 1;
        const nodeId2 = node2?.id || 2;

        console.log(`  ✅ Nodes created: #${nodeId1}, #${nodeId2}\n`);

        // 2. Create Super User
        console.log('→ Creating Super User...');
        try {
            const su = await createUser(sql, {
                email: 'admin@jtxfield.com',
                password: 'admin123',
                role: 'SU',
                fullName: 'Admin User',
            });
            console.log(`  ✅ Super User: ${su.email} (ID: ${su.id})`);
        } catch (e: any) {
            if (e.message?.includes('unique')) {
                console.log('  ⏭️  Super User already exists');
            } else {
                throw e;
            }
        }

        // 3. Create Office Managers
        console.log('\n→ Creating Office Managers...');

        try {
            const om1 = await createUser(sql, {
                email: 'manager1@downtown.com',
                password: 'manager123',
                role: 'OM',
                nodeId: nodeId1,
                fullName: 'John Manager',
            });
            console.log(`  ✅ OM #1: ${om1.email} (Node: Downtown Construction)`);
        } catch (e: any) {
            if (e.message?.includes('unique')) {
                console.log('  ⏭️  OM #1 already exists');
            } else {
                throw e;
            }
        }

        try {
            const om2 = await createUser(sql, {
                email: 'manager2@westside.com',
                password: 'manager123',
                role: 'OM',
                nodeId: nodeId2,
                fullName: 'Sarah Williams',
            });
            console.log(`  ✅ OM #2: ${om2.email} (Node: Westside Builders)`);
        } catch (e: any) {
            if (e.message?.includes('unique')) {
                console.log('  ⏭️  OM #2 already exists');
            } else {
                throw e;
            }
        }

        // 4. Create Projects
        console.log('\n→ Creating projects...');

        await sql`
            INSERT INTO projects (node_id, name, is_active)
            VALUES 
                (${nodeId1}, 'Downtown Office Renovation', true),
                (${nodeId1}, 'High-Rise Tower A', true),
                (${nodeId2}, 'Westside Mall Expansion', true),
                (${nodeId2}, 'Residential Complex Phase 2', true)
            ON CONFLICT DO NOTHING
        `;
        console.log('  ✅ Projects created\n');

        // 5. Create Test Members (Workers)
        console.log('→ Creating test workers...');

        await sql`
            INSERT INTO members (company_id, phone_number, full_name, domain, status, onboarded_at)
            VALUES 
                (${nodeId1}, '+15551234567', 'Mike Foreman', 'construction', 'approved', NOW()),
                (${nodeId1}, '+15551234568', 'Carlos Rodriguez', 'construction', 'approved', NOW()),
                (${nodeId2}, '+15559876543', 'David Builder', 'construction', 'approved', NOW())
            ON CONFLICT (phone_number) DO NOTHING
        `;
        console.log('  ✅ Workers created\n');

        // 6. Ensure Inbox projects exist
        console.log('→ Ensuring Inbox projects...');
        await sql`
            INSERT INTO projects (node_id, name, is_inbox, is_active)
            SELECT id, 'Inbox', true, true FROM nodes
            WHERE NOT EXISTS (
                SELECT 1 FROM projects WHERE node_id = nodes.id AND is_inbox = true
            )
        `;
        console.log('  ✅ Inbox projects ready\n');

        console.log('🎉 Seed complete!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 TEST CREDENTIALS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n🔐 Super User (Full Access):');
        console.log('   Email: admin@jtxfield.com');
        console.log('   Password: admin123');
        console.log('\n👔 Office Manager #1 (Downtown Construction):');
        console.log('   Email: manager1@downtown.com');
        console.log('   Password: manager123');
        console.log('\n👔 Office Manager #2 (Westside Builders):');
        console.log('   Email: manager2@westside.com');
        console.log('   Password: manager123');
        console.log('\n💬 Test Workers:');
        console.log('   +15551234567 - Mike Foreman');
        console.log('   +15551234568 - Carlos Rodriguez');
        console.log('   +15559876543 - David Builder');
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Seed error:', error);
        throw error;
    } finally {
        await sql.end();
    }
}

seedDatabase().catch(console.error);
