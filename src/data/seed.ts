// Run this with: npx tsx seed.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { nodes, members } from '../db/schema';
import dotenv from 'dotenv';

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function main() {
    console.log('🌱 Seeding...');

    // 1. Create Node (Company)
    const newNode = await db.insert(nodes).values({
        name: 'Acme Electric',
        defaultHourlyRate: '85.00',
    }).returning();

    // 2. Create Member (REPLACE WITH YOUR PHONE NUMBER)
    await db.insert(members).values({
        companyId: newNode[0].id,
        phoneNumber: '+15551234567',
        fullName: 'Mike the Foreman',
    });

    console.log('✅ Done!');
    process.exit(0);
}

main();