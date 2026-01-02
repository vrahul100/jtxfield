import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

dotenv.config();

interface ConversationTurn {
    conversation_id: string;
    turn_number: number;
    phone_number: string;
    message_text: string;
    image_url: string;
    audio_url: string;
    expected_bucket_status: string;
    expected_hours: string;
    expected_materials: string;
    description: string;
}

interface ConversationTest {
    id: string;
    turns: ConversationTurn[];
}

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const sql = postgres(process.env.DATABASE_URL!);

const createdBucketIds: number[] = [];
const createdTransactionIds: number[] = [];

async function simulateWebhookCall(turn: ConversationTurn): Promise<{ response: Response; body: string }> {
    const formData = new URLSearchParams();
    formData.append('From', `whatsapp:${turn.phone_number}`);
    formData.append('Body', turn.message_text);

    let mediaCount = 0;
    if (turn.image_url) {
        formData.append('MediaUrl0', turn.image_url);
        mediaCount++;
    }
    if (turn.audio_url) {
        formData.append(`MediaUrl${mediaCount}`, turn.audio_url);
        mediaCount++;
    }
    formData.append('NumMedia', mediaCount.toString());

    const response = await fetch(`${BASE_URL}/twhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
    });

    const body = await response.text();
    return { response, body };
}

async function getCurrentBucket(phoneNumber: string): Promise<any | null> {
    // Get the most recent bucket for this member
    const buckets = await sql`
        SELECT b.*
        FROM buckets b
        JOIN members m ON b.member_id = m.id
        WHERE m.phone_number = ${phoneNumber}
        ORDER BY b.created_at DESC
        LIMIT 1
    `;

    if (buckets.length > 0) {
        if (!createdBucketIds.includes(buckets[0].id)) {
            createdBucketIds.push(buckets[0].id);
        }
        return buckets[0];
    }
    return null;
}

async function getTransaction(bucketId: number): Promise<any | null> {
    const transactions = await sql`
        SELECT *
        FROM txns
        WHERE bucket_id = ${bucketId}
        LIMIT 1
    `;

    if (transactions.length > 0) {
        if (!createdTransactionIds.includes(transactions[0].id)) {
            createdTransactionIds.push(transactions[0].id);
        }
        return transactions[0];
    }
    return null;
}

function parseAIResponse(xmlBody: string): string | null {
    const match = xmlBody.match(/<Message>(.*?)<\/Message>/s);
    return match ? match[1] : null;
}

async function runConversation(conv: ConversationTest): Promise<boolean> {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🗣️  Conversation: ${conv.id}`);
    console.log(`${'='.repeat(70)}`);

    let allPassed = true;

    for (const turn of conv.turns) {
        console.log(`\n📱 Turn ${turn.turn_number}: ${turn.description}`);
        console.log(`   User: "${turn.message_text}"`);

        // Send message
        const { response, body } = await simulateWebhookCall(turn);

        if (!response.ok) {
            console.log(`   ❌ Webhook failed: ${response.status}`);
            allPassed = false;
            continue;
        }

        // Parse AI response
        const aiResponse = parseAIResponse(body);
        if (aiResponse) {
            console.log(`   🤖 AI: "${aiResponse}"`);
        }

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get current bucket
        const bucket = await getCurrentBucket(turn.phone_number);
        if (!bucket) {
            console.log(`   ❌ No bucket found`);
            allPassed = false;
            continue;
        }

        console.log(`   📦 Bucket #${bucket.id} - Status: ${bucket.status}`);

        // Check expected status
        if (turn.expected_bucket_status && bucket.status !== turn.expected_bucket_status) {
            console.log(`   ❌ Status mismatch: expected "${turn.expected_bucket_status}", got "${bucket.status}"`);
            allPassed = false;
        } else if (turn.expected_bucket_status) {
            console.log(`   ✅ Status matches: ${bucket.status}`);
        }

        // Check extracted data
        if (bucket.extracted_data) {
            const extracted = typeof bucket.extracted_data === 'string'
                ? JSON.parse(bucket.extracted_data)
                : bucket.extracted_data;

            if (extracted.hoursWorked) {
                console.log(`   ⏱️  Extracted hours: ${extracted.hoursWorked}`);
            }
            if (extracted.materialsUsed && extracted.materialsUsed.length > 0) {
                console.log(`   🔨 Extracted materials: ${extracted.materialsUsed.join(', ')}`);
            }

            // Verify expected hours
            if (turn.expected_hours) {
                const expected = parseFloat(turn.expected_hours);
                if (extracted.hoursWorked === expected) {
                    console.log(`   ✅ Hours match: ${expected}`);
                } else {
                    console.log(`   ❌ Hours mismatch: expected ${expected}, got ${extracted.hoursWorked}`);
                    allPassed = false;
                }
            }

            // Verify expected materials
            if (turn.expected_materials) {
                const expectedMats = turn.expected_materials.toLowerCase().split(';').map(m => m.trim());
                const actualMats = (extracted.materialsUsed || []).map((m: string) => m.toLowerCase());
                const hasAllMaterials = expectedMats.every(m => actualMats.some(a => a.includes(m)));

                if (hasAllMaterials) {
                    console.log(`   ✅ Materials match`);
                } else {
                    console.log(`   ❌ Materials mismatch: expected ${turn.expected_materials}, got ${actualMats.join(', ')}`);
                    allPassed = false;
                }
            }
        }

        // Check transaction if bucket is submitted
        if (bucket.status === 'submitted') {
            const transaction = await getTransaction(bucket.id);
            if (transaction) {
                console.log(`   💰 Transaction #${transaction.id} created - ${transaction.time}hrs, ${transaction.material || 'no materials'}`);
            }
        }

        // Small delay between turns
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n${allPassed ? '✅' : '❌'} Conversation ${conv.id}: ${allPassed ? 'PASSED' : 'FAILED'}`);
    return allPassed;
}

async function cleanup() {
    console.log('\n🧹 Cleaning up test data...');

    if (createdTransactionIds.length > 0) {
        await sql`DELETE FROM txns WHERE id IN ${sql(createdTransactionIds)}`;
        console.log(`   Deleted ${createdTransactionIds.length} transactions`);
    }

    if (createdBucketIds.length > 0) {
        await sql`DELETE FROM buckets WHERE id IN ${sql(createdBucketIds)}`;
        console.log(`   Deleted ${createdBucketIds.length} buckets`);
    }
}

async function main() {
    console.log('🚀 Starting Conversation Test Suite\n');
    console.log(`Base URL: ${BASE_URL}\n`);

    // Read conversation test cases
    const csvContent = readFileSync('tests/webhook-conversations.csv', 'utf-8');
    const turns = parse(csvContent, {
        columns: ['conversation_id', 'turn_number', 'phone_number', 'message_text', 'image_url', 'audio_url', 'expected_bucket_status', 'expected_hours', 'expected_materials', 'description'],
        skip_empty_lines: true,
        comment: '#',
        from_line: 3, // Skip header comment lines
        trim: true,
    }) as ConversationTurn[];

    // Group by conversation_id
    const conversations = new Map<string, ConversationTest>();
    for (const turn of turns) {
        if (!conversations.has(turn.conversation_id)) {
            conversations.set(turn.conversation_id, {
                id: turn.conversation_id,
                turns: [],
            });
        }
        conversations.get(turn.conversation_id)!.turns.push(turn);
    }

    // Sort turns within each conversation
    for (const conv of conversations.values()) {
        conv.turns.sort((a, b) => a.turn_number - b.turn_number);
    }

    console.log(`Found ${conversations.size} conversations with ${turns.length} total turns\n`);

    const results: boolean[] = [];

    // Run each conversation
    for (const conv of conversations.values()) {
        const passed = await runConversation(conv);
        results.push(passed);

        // Delay between conversations
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Cleanup
    await cleanup();

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70));

    const passed = results.filter(r => r).length;
    const failed = results.filter(r => !r).length;

    console.log(`Total Conversations: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);

    await sql.end();

    process.exit(failed > 0 ? 1 : 0);
}

main();
