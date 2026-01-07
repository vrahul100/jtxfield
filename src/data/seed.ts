import postgres from 'postgres';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);
console.log(process.env.DATABASE_URL);

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
        const adminHash = await hashPassword('buBitsu12#');
        const managerHash = await hashPassword('jujItsu123$');

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

        // 7. CREATE TRANSACTIONS (Work Logs)
        console.log('📝 Creating transactions...');
        const members = [
            { id: 1, company_id: downtown.id }, // Mike (assumed ID 1)
            { id: 2, company_id: downtown.id }, // Carlos (assumed ID 2)
            { id: 3, company_id: westside.id }  // David (assumed ID 3)
        ];

        // Fetch actual member IDs to be safe
        const dbMembers = await sql`SELECT id, company_id, phone_number FROM members`;

        const projects = [project1, project2, project3];

        let txnCount = 0;

        // Generate transactions for the last 30 days
        // for (let i = 0; i < 30; i++) {
        //     const date = new Date();
        //     date.setDate(date.getDate() - i);
        //     const dateStr = date.toISOString();

        //     // Randomly create transactions for each member
        //     for (const member of dbMembers) {
        //         // 70% chance a member worked on a given day
        //         if (Math.random() > 0.3) {
        //             // Pick a random project belonging to the member's company
        //             const memberProjects = projects.filter(p => p.node_id === member.company_id);
        //             if (memberProjects.length === 0) continue;

        //             const project = memberProjects[Math.floor(Math.random() * memberProjects.length)];
        //             const hours = 4 + Math.floor(Math.random() * 5); // 4-8 hours

        //             // Create a bucket first
        //             const [bucket] = await sql`
        //                 INSERT INTO buckets (
        //                     node_id, project_id, member_id, 
        //                     status, raw_text, summary, source,
        //                     from_phone,
        //                     created_at, updated_at
        //                 )
        //                 VALUES (
        //                     ${member.company_id}, ${project.id}, ${member.id},
        //                     'submitted', 'Work log entry', 'Auto-generated work log', 'web',
        //                     ${member.phone_number},
        //                     ${dateStr}, ${dateStr}
        //                 )
        //                 RETURNING id
        //             `;

        //             await sql`
        //                 INSERT INTO txns (bucket_id, user_id, project_id, company_id, time, created_at)
        //                 VALUES (${bucket.id}, ${member.id}, ${project.id}, ${member.company_id}, ${hours}, ${dateStr})
        //             `;
        //             txnCount++;
        //         }
        //     }
        // }
        // console.log(`  ✅ Created ${txnCount} transactions across varying dates\n`);

        console.log('🎉 Seeding complete!\n');
        console.log('═══════════════════════════════════════════');
        console.log('🔐 Test Credentials:');
        console.log('═══════════════════════════════════════════');
        console.log('\n📌 Super User (Full Access)');
        console.log('   Email:    admin@jtxfield.com');
        console.log('   Password: buBitsu12#');
        console.log('\n📌 Office Manager #1 (Downtown Construction)');
        console.log('   Email:    manager1@downtown.com');
        console.log('   Password: jujItsu123$');
        console.log('\n📌 Office Manager #2 (Westside Builders)');
        console.log('   Email:    manager2@westside.com');
        console.log('   Password: rurItsu123$');
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