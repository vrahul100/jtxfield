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

    // PRIORITY 1: Use AI extracted_data if available
    let time: number | null = null;
    let material: string | null = null;

    if (bucket.extracted_data) {
        try {
            const extracted = typeof bucket.extracted_data === 'string'
                ? JSON.parse(bucket.extracted_data)
                : bucket.extracted_data;

            // Use AI-extracted hours
            if (extracted.hoursWorked && typeof extracted.hoursWorked === 'number') {
                time = extracted.hoursWorked;
                console.log(`[TxnExtraction] Using AI-extracted hours: ${time}`);
            }

            // Use AI-extracted materials
            if (extracted.materialsUsed && Array.isArray(extracted.materialsUsed) && extracted.materialsUsed.length > 0) {
                material = extracted.materialsUsed.join(', ');
                console.log(`[TxnExtraction] Using AI-extracted materials: ${material}`);
            }
        } catch (e) {
            console.warn(`[TxnExtraction] Failed to parse extracted_data:`, e);
        }
    }

    // PRIORITY 2: Fallback to conversation history parsing (if AI data missing)
    if (!time && bucket.conversation_history) {
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

    // PRIORITY 3: Fallback to raw_text parsing
    if (!time && bucket.raw_text) {
        const hoursMatch = bucket.raw_text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
        if (hoursMatch) {
            time = parseFloat(hoursMatch[1]);
        }
    }

    // Extract materials from raw_text if not from AI
    if (!material && bucket.raw_text) {
        // Simple material extraction - looks for common construction materials
        const materialWords = bucket.raw_text.match(/\b(rebar|wire|concrete|lumber|steel|brick|drywall|paint|nails|screws|wood|metal|pipe|cable|copper|pvc|outlets|wires)\b/gi);
        if (materialWords && materialWords.length > 0) {
            material = [...new Set(materialWords.map((m: string) => m.toLowerCase()))].join(', ');
        }
    }

    // Extract labor description from raw_text
    const labor = bucket.raw_text || null;

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
