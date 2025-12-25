import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

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
        console.log('  ✅ All data cleared\n');

        // 2. CREATE COMPANY (NODE)
        console.log('🏢 Creating company...');
        const [company] = await sql`
      INSERT INTO nodes (name, created_at)
      VALUES ('Acme Construction', NOW())
      RETURNING *
    `;
        console.log(`  ✅ Created: ${company.name} (ID: ${company.id})\n`);

        // 3. CREATE PROJECT
        console.log('📋 Creating project...');
        const [project] = await sql`
      INSERT INTO projects (node_id, name, created_at)
      VALUES (${company.id}, 'Downtown Office Renovation', NOW())
      RETURNING *
    `;
        console.log(`  ✅ Created: ${project.name} (ID: ${project.id})\n`);

        console.log('🎉 Seeding complete!\n');
        console.log('Summary:');
        console.log(`  Company: ${company.name}`);
        console.log(`  Project: ${project.name}`);

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        throw error;
    } finally {
        await sql.end();
    }
}

seed();