import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

dotenv.config();

interface TestCase {
    phone_number: string;
    message_text: string;
    image_url: string;
    audio_url: string;
    expected_hours: string;
    expected_materials: string;
    description: string;
}

interface TestResult {
    testCase: TestCase;
    passed: boolean;
    bucketId?: number;
    transactionId?: number;
    error?: string;
    extractedHours?: number | null;
    extractedMaterials?: string | null;
}

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const sql = postgres(process.env.DATABASE_URL!);

// Parse command-line arguments
const args = process.argv.slice(2);
const persistMode = args.includes('--persist');
const testRunId = new Date().toISOString();

console.log(`\n🧪 Webhook Test Runner`);
console.log(`Mode: ${persistMode ? 'PERSIST (buckets will remain for review)' : 'CLEANUP (buckets will be deleted)'}`);
console.log(`Test Run ID: ${testRunId}\n`);

// Track created buckets for cleanup
const createdBucketIds: number[] = [];
const createdTransactionIds: number[] = [];

async function simulateWebhookCall(testCase: TestCase, testRunId: string): Promise<Response> {
    const formData = new URLSearchParams();

    // Add test run marker to message for identification
    const messageWithMarker = `${testCase.message_text} [TEST_RUN:${testRunId}]`;

    formData.append('From', `whatsapp:${testCase.phone_number}`);
    formData.append('Body', messageWithMarker);
    formData.append('ForceNewBucket', 'true'); // Always create new bucket for testing

    let mediaCount = 0;
    if (testCase.image_url) {
        formData.append('MediaUrl0', testCase.image_url);
        formData.append('MediaContentType0', 'image/jpeg');
        mediaCount++;
    }
    if (testCase.audio_url) {
        formData.append(`MediaUrl${mediaCount}`, testCase.audio_url);
        formData.append(`MediaContentType${mediaCount}`, 'audio/ogg'); // OGG format
        mediaCount++;
    }
    formData.append('NumMedia', mediaCount.toString());

    console.log(`   📤 Sending: NumMedia=${mediaCount}, Audio=${testCase.audio_url || 'none'}`);

    return fetch(`${BASE_URL}/twhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
    });
}

async function verifyBucketCreation(phoneNumber: string): Promise<{ id: number; extracted_data: any; status: string; validation_errors: string | null; transcripts: string | null } | null> {
    // Initial wait for webhook processing to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Poll for bucket completion instead of fixed wait
    const maxAttempts = 30; // 30 seconds max after initial wait
    const pollInterval = 1000; // Check every 1 second

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const buckets = await sql`
            SELECT b.id, b.extracted_data, b.status, b.validation_errors, b.transcripts, b.created_at
            FROM buckets b
            JOIN members m ON b.member_id = m.id
            WHERE m.phone_number = ${phoneNumber}
            ORDER BY b.created_at DESC
            LIMIT 1
        `;

        if (buckets.length > 0) {
            const bucket = buckets[0];

            // Track this bucket for cleanup
            if (!createdBucketIds.includes(bucket.id)) {
                createdBucketIds.push(bucket.id);
            }

            // Check if validation completed (submitted) or has extracted_data
            if (bucket.status === 'submitted' || bucket.extracted_data) {
                console.log(`   ⏱️  Processing completed in ${2 + attempt}s`);
                return bucket;
            }

            // Show progress every 5 seconds
            if (attempt % 5 === 4) {
                console.log(`   ⏳ Waiting for LLM... (${2 + attempt}s, status: ${bucket.status})`);
            }
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout - return whatever we have
    console.log(`   ⚠️  Timeout after ${2 + maxAttempts}s`);
    const buckets = await sql`
        SELECT b.id, b.extracted_data, b.status, b.validation_errors, b.transcripts, b.created_at
        FROM buckets b
        JOIN members m ON b.member_id = m.id
        WHERE m.phone_number = ${phoneNumber}
        ORDER BY b.created_at DESC
        LIMIT 1
    `;

    if (buckets.length > 0) {
        createdBucketIds.push(buckets[0].id);
        return buckets[0];
    }

    return null;
}

async function verifyTransactionCreation(bucketId: number): Promise<{ id: number; time: number | null; material: string | null } | null> {
    const transactions = await sql`
        SELECT id, time, material
        FROM txns
        WHERE bucket_id = ${bucketId}
        LIMIT 1
    `;

    if (transactions.length > 0) {
        createdTransactionIds.push(transactions[0].id);
        return transactions[0];
    }
    return null;
}

async function runTest(testCase: TestCase, index: number, testRunId: string): Promise<TestResult> {
    console.log(`\n📋 Test ${index + 1}: ${testCase.description}`);
    console.log(`   Phone: ${testCase.phone_number}`);
    console.log(`   Text: ${testCase.message_text || '(none)'}`);
    console.log(`   Image: ${testCase.image_url || '(none)'}`);
    console.log(`   Audio: ${testCase.audio_url || '(none)'}`);

    try {
        // Call webhook
        const response = await simulateWebhookCall(testCase, testRunId);
        if (!response.ok) {
            return {
                testCase,
                passed: false,
                error: `Webhook returned ${response.status}`,
            };
        }

        // Verify bucket creation
        const bucket = await verifyBucketCreation(testCase.phone_number);
        if (!bucket) {
            return {
                testCase,
                passed: false,
                error: 'Bucket not created',
            };
        }

        console.log(`   ✅ Bucket created: #${bucket.id}`);
        console.log(`   📊 Status: ${bucket.status}`);

        if (bucket.transcripts) {
            try {
                const transcripts = JSON.parse(bucket.transcripts);
                console.log(`   🎤 Transcripts:`, transcripts);
            } catch { /* ignore */ }
        }

        if (bucket.validation_errors) {
            console.log(`   ⚠️  Validation errors:`, bucket.validation_errors);
        }

        // Parse extracted data
        let extractedHours: number | null = null;
        let extractedMaterials: string | null = null;

        if (bucket.extracted_data) {
            const data = typeof bucket.extracted_data === 'string'
                ? JSON.parse(bucket.extracted_data)
                : bucket.extracted_data;

            // Show full LLM extraction for debugging
            console.log(`   🤖 LLM Extraction:`, JSON.stringify(data, null, 2));

            extractedHours = data.hoursWorked || null;
            extractedMaterials = data.materialsUsed?.join(', ') || null;

            console.log(`   ⏱️  Extracted hours: ${extractedHours}`);
            console.log(`   🔨 Extracted materials: ${extractedMaterials}`);
        } else {
            console.log(`   ⚠️  No extracted_data found in bucket`);
        }

        // Verify transaction if expected
        const transaction = await verifyTransactionCreation(bucket.id);
        if (transaction) {
            console.log(`   ✅ Transaction created: #${transaction.id}`);
            console.log(`   Transaction hours: ${transaction.time}`);
            console.log(`   Transaction materials: ${transaction.material}`);
        }

        // Check expectations
        let passed = true;
        if (testCase.expected_hours) {
            const expected = parseFloat(testCase.expected_hours);
            if (extractedHours !== expected) {
                console.log(`   ❌ Hours mismatch: expected ${expected}, got ${extractedHours}`);
                passed = false;
            }
        }

        if (testCase.expected_materials && extractedMaterials) {
            const expectedMats = testCase.expected_materials.toLowerCase().split(',').map(m => m.trim());
            const actualMats = extractedMaterials.toLowerCase().split(',').map(m => m.trim());
            const hasAllMaterials = expectedMats.every(m => actualMats.some(a => a.includes(m)));

            if (!hasAllMaterials) {
                console.log(`   ❌ Materials mismatch: expected ${testCase.expected_materials}, got ${extractedMaterials}`);
                passed = false;
            }
        }

        return {
            testCase,
            passed,
            bucketId: bucket.id,
            transactionId: transaction?.id,
            extractedHours,
            extractedMaterials,
        };
    } catch (error: any) {
        return {
            testCase,
            passed: false,
            error: error.message,
        };
    }
}

async function cleanup() {
    console.log('\n🧹 Cleaning up test data...');

    // Delete transactions first (foreign key constraint)
    if (createdTransactionIds.length > 0) {
        await sql`DELETE FROM txns WHERE id IN ${sql(createdTransactionIds)}`;
        console.log(`   Deleted ${createdTransactionIds.length} transactions`);
    }

    // Delete buckets
    if (createdBucketIds.length > 0) {
        await sql`DELETE FROM buckets WHERE id IN ${sql(createdBucketIds)}`;
        console.log(`   Deleted ${createdBucketIds.length} buckets`);
    }
}

async function main() {
    console.log('🚀 Starting Webhook Test Suite\n');
    console.log(`Base URL: ${BASE_URL}\n`);

    // Read test cases from CSV
    const csvContent = readFileSync('tests/webhook-test-cases.csv', 'utf-8');
    const testCases = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as TestCase[];

    console.log(`\n🚀 Running ${testCases.length} test cases...\n`);

    const results: TestResult[] = [];
    const testRunId = crypto.randomUUID(); // Generate a unique ID for this test run

    // Run all tests
    for (let i = 0; i < testCases.length; i++) {
        const result = await runTest(testCases[i], i, testRunId);
        results.push(result);

        // Add delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Conditional cleanup
    if (!persistMode) {
        console.log('\n🧹 Cleaning up test data...');
        await cleanup();
    } else {
        console.log('\n📦 PERSIST MODE: Test buckets preserved for UI review');
        console.log(`   Test Run ID: ${testRunId}`);
        console.log(`   Created ${createdBucketIds.length} buckets`);
        console.log(`   To clean up later, run: npm run test:cleanup`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`Total: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);

    if (failed > 0) {
        console.log('\n❌ Failed Tests:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`   - ${r.testCase.description}: ${r.error || 'Assertion failed'}`);
        });
    }

    await sql.end();

    process.exit(failed > 0 ? 1 : 0);
}

main();
