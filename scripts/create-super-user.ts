#!/usr/bin/env npx tsx

/**
 * Create a Super User (SU) account for admin access
 * Uses SUPER_USER_EMAIL and SUPER_USER_PASSWORD from .env
 * or defaults to admin@jtxfield.com / AduJitsu12#
 * Usage: npx tsx scripts/create-super-user.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { createUser } from '../src/services/auth.js';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function createSuperUser() {
    console.log('👤 Creating Super User...\n');

    try {
        const email = process.env.SUPER_USER_EMAIL || 'admin@jtxfield.com';
        const password = process.env.SUPER_USER_PASSWORD || 'AduJitsu12#';

        const user = await createUser(sql, {
            email,
            password,
            role: 'SU',
            fullName: 'Super User',
        });

        console.log('  ✅ Super User created successfully:');
        console.log(`     Email: ${user.email}`);
        console.log(`     Role: ${user.role}`);
        console.log(`     ID: ${user.id}\n`);

        console.log('🔐 Login credentials:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}\n`);
    } catch (error: any) {
        if (error.message?.includes('unique')) {
            console.log('  ⏭️  Super User already exists\n');
        } else {
            console.error('  ❌ Error creating super user:', error.message);
            throw error;
        }
    }

    await sql.end();
    console.log('🎉 Done!');
}

createSuperUser().catch(console.error);
