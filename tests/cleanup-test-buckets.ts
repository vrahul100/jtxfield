import postgres from 'postgres';
import dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!);

// Parse command-line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

async function cleanup() {
    console.log('\n🔍 Searching for test buckets...\n');

    // Find all buckets with TEST_RUN marker
    const testBuckets = await sql`
        SELECT id, raw_text, created_at, status
        FROM buckets
        WHERE raw_text LIKE '%[TEST_RUN:%'
        ORDER BY created_at DESC
    `;

    if (testBuckets.length === 0) {
        console.log('✅ No test buckets found!');
        await sql.end();
        return;
    }

    console.log(`Found ${testBuckets.length} test bucket(s):\n`);

    // Show sample
    const sample = testBuckets.slice(0, 5);
    sample.forEach((bucket: any) => {
        const testRunMatch = bucket.raw_text.match(/\[TEST_RUN:([^\]]+)\]/);
        const testRunId = testRunMatch ? testRunMatch[1] : 'unknown';
        console.log(`  ID: ${bucket.id} | Status: ${bucket.status} | Created: ${bucket.created_at.toISOString()} | Run: ${testRunId.substring(0, 20)}...`);
    });

    if (testBuckets.length > 5) {
        console.log(`  ... and ${testBuckets.length - 5} more`);
    }

    if (dryRun) {
        console.log('\n🔍 DRY RUN - No changes will be made');
        await sql.end();
        return;
    }

    // Confirm deletion
    if (!force) {
        const confirmed = await confirm(`\n⚠️  Delete ${testBuckets.length} test bucket(s) and associated transactions?`);
        if (!confirmed) {
            console.log('❌ Cleanup cancelled');
            await sql.end();
            return;
        }
    }

    // Delete transactions first (foreign key constraint)
    const bucketIds = testBuckets.map((b: any) => b.id);
    const deletedTxns = await sql`
        DELETE FROM txns
        WHERE bucket_id = ANY(${bucketIds})
        RETURNING id
    `;

    // Delete buckets
    const deletedBuckets = await sql`
        DELETE FROM buckets
        WHERE id = ANY(${bucketIds})
        RETURNING id
    `;

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Deleted ${deletedBuckets.length} bucket(s)`);
    console.log(`   Deleted ${deletedTxns.length} transaction(s)`);

    await sql.end();
}

function confirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(`${question} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

// Run cleanup
cleanup().catch((error) => {
    console.error('Error during cleanup:', error);
    sql.end();
    process.exit(1);
});
