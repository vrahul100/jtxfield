import { Sql } from 'postgres';

export interface TransactionData {
    bucketId: number;
    companyId: number;
    userId: number;
    projectId: number | null;
    job: string | null;
    time: number | null; // hours
    labor: string | null;
    material: string | null;
    evidence: string | null;
    scopeDescription: string | null;
}

/**
 * Extract transaction from a submitted bucket
 */
export async function extractTransactionFromBucket(sql: Sql, bucketId: number): Promise<void> {
    const [bucket] = await sql`
        SELECT 
            b.*,
            m.company_id as node_id,
            m.id as member_id
        FROM buckets b
        JOIN members m ON b.member_id = m.id
        WHERE b.id = ${bucketId}
    `;

    if (!bucket) {
        console.error(`[TxnExtraction] Bucket #${bucketId} not found`);
        return;
    }

    // Extract time from conversation history or raw_text
    let time: number | null = null;

    // First, check conversation_history for user's hour response
    if (bucket.conversation_history) {
        try {
            const history = typeof bucket.conversation_history === 'string'
                ? JSON.parse(bucket.conversation_history)
                : bucket.conversation_history;

            for (const msg of history) {
                if (msg.role === 'user') {
                    // Look for hours in user messages
                    const hoursMatch = msg.content?.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
                    if (hoursMatch) {
                        time = parseFloat(hoursMatch[1]);
                        break;
                    }
                    // Also check for standalone numbers that might be hours
                    const numberMatch = msg.content?.trim().match(/^(\d+(?:\.\d+)?)$/);
                    if (numberMatch && !time) {
                        time = parseFloat(numberMatch[1]);
                    }
                }
            }
        } catch (e) {
            console.warn(`[TxnExtraction] Failed to parse conversation_history:`, e);
        }
    }

    // Fallback: extract from raw_text
    if (!time && bucket.raw_text) {
        const hoursMatch = bucket.raw_text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
        if (hoursMatch) {
            time = parseFloat(hoursMatch[1]);
        }
    }

    // Extract labor description from raw_text
    const labor = bucket.raw_text || null;

    // Try to extract materials from raw_text
    let material: string | null = null;
    if (bucket.raw_text) {
        // Simple material extraction - looks for common construction materials
        const materialWords = bucket.raw_text.match(/\b(rebar|wire|concrete|lumber|steel|brick|drywall|paint|nails|screws|wood|metal|pipe|cable)\b/gi);
        if (materialWords && materialWords.length > 0) {
            material = [...new Set(materialWords.map((m: string) => m.toLowerCase()))].join(', ');
        }
    }

    // Build evidence JSON (images + audio)
    let evidence: string | null = null;
    const evidenceItems: string[] = [];
    if (bucket.image_urls) {
        try {
            const images = JSON.parse(bucket.image_urls);
            evidenceItems.push(...images);
        } catch { /* ignore */ }
    }
    if (bucket.audio_urls) {
        try {
            const audio = JSON.parse(bucket.audio_urls);
            evidenceItems.push(...audio);
        } catch { /* ignore */ }
    }
    if (evidenceItems.length > 0) {
        evidence = JSON.stringify(evidenceItems);
    }

    // Create transaction
    await sql`
        INSERT INTO txns (
            bucket_id,
            company_id,
            user_id,
            project_id,
            job,
            time,
            labor,
            material,
            evidence,
            scope_description,
            status
        ) VALUES (
            ${bucketId},
            ${bucket.node_id},
            ${bucket.member_id},
            ${bucket.project_id},
            ${bucket.project_name_raw || null},
            ${time},
            ${labor},
            ${material},
            ${evidence},
            ${bucket.raw_text || null},
            'COMPLETED'
        )
    `;

    console.log(`[TxnExtraction] Created transaction for bucket #${bucketId} - time: ${time}, materials: ${material}`);
}
