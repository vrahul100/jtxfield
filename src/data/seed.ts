import postgres from 'postgres';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

async function seed() {
    console.log('🌱 Seeding database...\n');

    try {
        // 1. CLEAR ALL DATA (reverse foreign key order)
        console.log('🗑️  Clearing all data...');
        await sql`DELETE FROM txns`;
        await sql`DELETE FROM buckets`;
        await sql`DELETE FROM members`;
        await sql`DELETE FROM projects`;
        await sql`DELETE FROM holding_tank`;
        await sql`DELETE FROM users`;
        await sql`DELETE FROM nodes`;
        console.log('  ✅ All data cleared\n');

        // 2. CREATE NODES (Companies)
        console.log('🏢 Creating nodes...');
        const [downtown] = await sql`
            INSERT INTO nodes (name, created_at)
            VALUES ('Downtown Construction', NOW())
            RETURNING *
        `;
        console.log(`  ✅ Created: ${downtown.name} (ID: ${downtown.id})`);

        const [westside] = await sql`
            INSERT INTO nodes (name, created_at)
            VALUES ('Westside Builders', NOW())
            RETURNING *
        `;
        console.log(`  ✅ Created: ${westside.name} (ID: ${westside.id})\n`);

        // 3. CREATE USERS
        console.log('👤 Creating users...');
        const adminHash = await hashPassword('admin123');
        const managerHash = await hashPassword('manager123');

        // Super User (no node)
        const [suUser] = await sql`
            INSERT INTO users (email, password_hash, role, full_name, is_active, created_at)
            VALUES ('admin@jtxfield.com', ${adminHash}, 'SU', 'Super Admin', true, NOW())
            RETURNING *
        `;
        console.log(`  ✅ Created SU: ${suUser.email}`);

        // Office Manager #1 (Downtown Construction)
        const [om1] = await sql`
            INSERT INTO users (email, password_hash, role, node_id, full_name, is_active, created_at)
            VALUES ('manager1@downtown.com', ${managerHash}, 'OM', ${downtown.id}, 'Downtown Manager', true, NOW())
            RETURNING *
        `;
        console.log(`  ✅ Created OM: ${om1.email} (Downtown Construction)`);

        // Office Manager #2 (Westside Builders)
        const [om2] = await sql`
            INSERT INTO users (email, password_hash, role, node_id, full_name, is_active, created_at)
            VALUES ('manager2@westside.com', ${managerHash}, 'OM', ${westside.id}, 'Westside Manager', true, NOW())
            RETURNING *
        `;
        console.log(`  ✅ Created OM: ${om2.email} (Westside Builders)\n`);

        // 4. CREATE INBOX PROJECTS
        console.log('📥 Creating Inbox projects...');
        await sql`
            INSERT INTO projects (node_id, name, is_inbox, is_active, created_at)
            VALUES (${downtown.id}, 'Inbox', true, true, NOW())
        `;
        await sql`
            INSERT INTO projects (node_id, name, is_inbox, is_active, created_at)
            VALUES (${westside.id}, 'Inbox', true, true, NOW())
        `;
        console.log('  ✅ Created Inbox projects for both nodes\n');

        // 5. CREATE PROJECTS
        console.log('📋 Creating projects...');
        const [project1] = await sql`
            INSERT INTO projects (node_id, name, is_active, created_at)
            VALUES (${downtown.id}, 'Downtown Office Renovation', true, NOW())
            RETURNING *
        `;
        console.log(`  ✅ Created: ${project1.name}`);

        const [project2] = await sql`
            INSERT INTO projects (node_id, name, is_active, created_at)
            VALUES (${downtown.id}, 'City Mall Project', true, NOW())
            RETURNING *
        `;
        console.log(`  ✅ Created: ${project2.name}`);

        const [project3] = await sql`
            INSERT INTO projects (node_id, name, is_active, created_at)
            VALUES (${westside.id}, 'Westside Residential Complex', true, NOW())
            RETURNING *
        `;
        console.log(`  ✅ Created: ${project3.name}\n`);

        // 6. CREATE TEST MEMBERS (Workers)
        console.log('👷 Creating test members...');
        await sql`
            INSERT INTO members (company_id, phone_number, full_name, status, domain, created_at)
            VALUES (${downtown.id}, '+15551234567', 'Mike Foreman', 'active', 'construction', NOW())
        `;
        console.log('  ✅ Created: Mike Foreman (+15551234567)');

        await sql`
            INSERT INTO members (company_id, phone_number, full_name, status, domain, created_at)
            VALUES (${downtown.id}, '+15551234568', 'Carlos Rodriguez', 'active', 'construction', NOW())
        `;
        console.log('  ✅ Created: Carlos Rodriguez (+15551234568)');

        await sql`
            INSERT INTO members (company_id, phone_number, full_name, status, domain, created_at)
            VALUES (${westside.id}, '+15559876543', 'David Builder', 'active', 'construction', NOW())
        `;
        console.log('  ✅ Created: David Builder (+15559876543)\n');

        console.log('🎉 Seeding complete!\n');
        console.log('═══════════════════════════════════════════');
        console.log('🔐 Test Credentials:');
        console.log('═══════════════════════════════════════════');
        console.log('\n📌 Super User (Full Access)');
        console.log('   Email:    admin@jtxfield.com');
        console.log('   Password: admin123');
        console.log('\n📌 Office Manager #1 (Downtown Construction)');
        console.log('   Email:    manager1@downtown.com');
        console.log('   Password: manager123');
        console.log('\n📌 Office Manager #2 (Westside Builders)');
        console.log('   Email:    manager2@westside.com');
        console.log('   Password: manager123');
        console.log('\n📌 Test Workers (WhatsApp/SMS)');
        console.log('   +15551234567 - Mike Foreman (Downtown)');
        console.log('   +15551234568 - Carlos Rodriguez (Downtown)');
        console.log('   +15559876543 - David Builder (Westside)');
        console.log('═══════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        throw error;
    } finally {
        await sql.end();
    }
}

seed();