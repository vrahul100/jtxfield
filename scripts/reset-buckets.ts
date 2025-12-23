#!/usr/bin/env npx tsx

/**
 * Reset buckets for fresh testing
 * Usage: npx tsx scripts/reset-buckets.ts
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();
const sql = postgres(process.env.DATABASE_URL!);

async function reset() {
    console.log('🧹 Resetting test data...\n');

    // Clear buckets
    const deletedBuckets = await sql`DELETE FROM buckets RETURNING id`;
    console.log(`  Deleted ${deletedBuckets.length} buckets`);

    // Clear holding tank
    const deletedHolding = await sql`DELETE FROM holding_tank RETURNING id`;
    console.log(`  Deleted ${deletedHolding.length} holding tank entries`);

    // Reset member's last project
    await sql`UPDATE members SET last_confirmed_project_id = NULL, project_confirmed_at = NULL`;
    console.log(`  Reset member project confirmations`);

    await sql.end();
    console.log('\n✅ Ready for testing!');
}

reset();
