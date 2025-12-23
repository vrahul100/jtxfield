import { Sql } from 'postgres';
import { extractMessageInfo } from './extractionService.js';
import { getQueue } from '../queue/index.js';

export type BucketStatus = 'open' | 'closed' | 'processing' | 'completed' | 'failed' | 'holding' | 'awaiting_correction';

export interface Bucket {
    id: number;
    member_id: number;
    node_id: number;
    project_id: number | null;
    source: 'sms' | 'whatsapp';
    from_phone: string;
    raw_text: string | null;
    image_urls: string | null;      // JSON array
    audio_urls: string | null;      // JSON array
    transcripts: string | null;     // JSON array
    domain: string | null;
    intent: string | null;
    project_name_raw: string | null;
    status: BucketStatus;
    validation_errors: string | null;
    ai_response: string | null;
    message_sids: string | null;    // JSON array
    created_at: Date;
    updated_at: Date;
}

export interface Member {
    id: number;
    company_id: number;
    phone_number: string;
    full_name: string | null;
    domain: string | null;
    last_confirmed_project_id: number | null;
    project_confirmed_at: Date | null;
}

const PROJECT_CONFIRMATION_HOURS = 4;

// ============================================================================
// Last Confirmed Project Logic
// ============================================================================

/**
 * Get the last confirmed project for a member (valid within 4 hours)
 */
export async function getLastConfirmedProject(
    sql: Sql,
    member: Member
): Promise<{ id: number; name: string } | null> {
    if (!member.last_confirmed_project_id || !member.project_confirmed_at) {
        return null;
    }

    // Check if confirmation is still valid (within 4 hours)
    const confirmedAt = new Date(member.project_confirmed_at);
    const hoursSince = (Date.now() - confirmedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSince > PROJECT_CONFIRMATION_HOURS) {
        return null;
    }

    const projects = await sql`
        SELECT id, name FROM projects WHERE id = ${member.last_confirmed_project_id}
    `;

    return projects.length > 0 ? projects[0] as { id: number; name: string } : null;
}

/**
 * Update member's last confirmed project
 */
export async function updateLastConfirmedProject(
    sql: Sql,
    memberId: number,
    projectId: number
): Promise<void> {
    await sql`
        UPDATE members 
        SET last_confirmed_project_id = ${projectId},
            project_confirmed_at = NOW()
        WHERE id = ${memberId}
    `;
}

// ============================================================================
// Open Bucket Logic
// ============================================================================

/**
 * Find an open bucket for a member + project combination
 */
export async function findOpenBucket(
    sql: Sql,
    memberId: number,
    projectId: number | null
): Promise<Bucket | null> {
    const buckets = await sql`
        SELECT * FROM buckets 
        WHERE member_id = ${memberId}
          AND status = 'open'
          AND (project_id = ${projectId} OR (project_id IS NULL AND ${projectId} IS NULL))
        ORDER BY created_at DESC
        LIMIT 1
    `;
    return buckets.length > 0 ? buckets[0] as Bucket : null;
}

/**
 * Create a new open bucket
 */
export async function createBucket(
    sql: Sql,
    data: {
        memberId: number;
        nodeId: number;
        projectId: number | null;
        source: 'sms' | 'whatsapp';
        fromPhone: string;
        rawText: string | null;
        imageUrls: string[];
        audioUrls: string[];
        transcripts: string[];
        messageSid: string | null;
    }
): Promise<Bucket> {
    const [bucket] = await sql`
        INSERT INTO buckets (
            member_id, node_id, project_id, source, from_phone, raw_text,
            image_urls, audio_urls, transcripts, message_sids, status
        )
        VALUES (
            ${data.memberId}, ${data.nodeId}, ${data.projectId}, ${data.source}, ${data.fromPhone},
            ${data.rawText},
            ${JSON.stringify(data.imageUrls)},
            ${JSON.stringify(data.audioUrls)},
            ${JSON.stringify(data.transcripts)},
            ${JSON.stringify(data.messageSid ? [data.messageSid] : [])},
            'open'
        )
        RETURNING *
    `;
    console.log(`[BucketService] 📥 Created new bucket #${bucket.id}`);
    return bucket as Bucket;
}

/**
 * Append message to an existing open bucket
 */
export async function appendToBucket(
    sql: Sql,
    bucket: Bucket,
    data: {
        rawText: string | null;
        imageUrls: string[];
        audioUrls: string[];
        transcripts: string[];
        messageSid: string | null;
    }
): Promise<Bucket> {
    // Parse existing JSON arrays
    const existingImages = bucket.image_urls ? JSON.parse(bucket.image_urls) : [];
    const existingAudio = bucket.audio_urls ? JSON.parse(bucket.audio_urls) : [];
    const existingTranscripts = bucket.transcripts ? JSON.parse(bucket.transcripts) : [];
    const existingSids = bucket.message_sids ? JSON.parse(bucket.message_sids) : [];

    // Append new data
    const newText = bucket.raw_text
        ? `${bucket.raw_text}\n---\n${data.rawText || ''}`
        : data.rawText;

    const [updated] = await sql`
        UPDATE buckets SET
            raw_text = ${newText},
            image_urls = ${JSON.stringify([...existingImages, ...data.imageUrls])},
            audio_urls = ${JSON.stringify([...existingAudio, ...data.audioUrls])},
            transcripts = ${JSON.stringify([...existingTranscripts, ...data.transcripts])},
            message_sids = ${JSON.stringify([...existingSids, ...(data.messageSid ? [data.messageSid] : [])])},
            updated_at = NOW()
        WHERE id = ${bucket.id}
        RETURNING *
    `;
    console.log(`[BucketService] 📝 Appended to bucket #${bucket.id}`);
    return updated as Bucket;
}

// ============================================================================
// AI Validation
// ============================================================================

export interface ValidationResult {
    isComplete: boolean;
    errors: string[];
    summary: string;
}

/**
 * Validate if a bucket is complete using AI
 */
export async function validateBucket(
    sql: Sql,
    bucket: Bucket
): Promise<ValidationResult> {
    const text = bucket.raw_text || '';
    const images = bucket.image_urls ? JSON.parse(bucket.image_urls) : [];
    const transcripts = bucket.transcripts ? JSON.parse(bucket.transcripts) : [];

    // Combine text and transcripts
    const fullText = [text, ...transcripts].filter(Boolean).join('\n');

    const extraction = await extractMessageInfo(
        fullText,
        bucket.domain || 'construction',
        images[0] || null
    );

    // Update bucket with extraction
    await sql`
        UPDATE buckets SET
            domain = ${extraction.domain},
            intent = ${extraction.intent},
            project_name_raw = ${extraction.projectName},
            ai_response = ${JSON.stringify(extraction)},
            updated_at = NOW()
        WHERE id = ${bucket.id}
    `;

    const errors: string[] = [];

    // Check clarity
    if (extraction.clarityScore < 0.6) {
        errors.push('Message is unclear. Please provide more details about the work done.');
    }

    // Check if we have actionable content
    if (extraction.intent === 'unknown') {
        errors.push('Could not determine what action you want to take.');
    }

    const isComplete = errors.length === 0 && extraction.clarityScore >= 0.6;

    // Update validation errors
    await sql`
        UPDATE buckets SET
            validation_errors = ${errors.length > 0 ? JSON.stringify(errors) : null},
            updated_at = NOW()
        WHERE id = ${bucket.id}
    `;

    return {
        isComplete,
        errors,
        summary: extraction.summary,
    };
}

/**
 * Close a bucket (mark as ready for processing)
 */
export async function closeBucket(sql: Sql, bucketId: number): Promise<void> {
    await sql`
        UPDATE buckets SET status = 'closed', updated_at = NOW()
        WHERE id = ${bucketId}
    `;
    console.log(`[BucketService] ✅ Closed bucket #${bucketId}`);
}

/**
 * Get next closed bucket for processing
 */
export async function getNextClosedBucket(sql: Sql): Promise<Bucket | null> {
    const buckets = await sql`
        SELECT * FROM buckets 
        WHERE status = 'closed'
        ORDER BY created_at ASC
        LIMIT 1
    `;
    return buckets.length > 0 ? buckets[0] as Bucket : null;
}

/**
 * Mark bucket as processing
 */
export async function markBucketProcessing(sql: Sql, bucketId: number): Promise<void> {
    await sql`
        UPDATE buckets SET status = 'processing', updated_at = NOW()
        WHERE id = ${bucketId}
    `;
}

/**
 * Mark bucket as completed
 */
export async function completeBucket(sql: Sql, bucketId: number): Promise<void> {
    await sql`
        UPDATE buckets SET status = 'completed', updated_at = NOW()
        WHERE id = ${bucketId}
    `;
}

/**
 * Mark bucket as failed
 */
export async function failBucket(sql: Sql, bucketId: number, error: string): Promise<void> {
    await sql`
        UPDATE buckets SET 
            status = 'failed',
            validation_errors = ${JSON.stringify([error])},
            updated_at = NOW()
        WHERE id = ${bucketId}
    `;
}

// ============================================================================
// Holding Tank (Unknown Users)
// ============================================================================

/**
 * Add message to holding tank (for unknown users)
 */
export async function addToHoldingTank(
    sql: Sql,
    data: {
        fromPhone: string;
        source: 'sms' | 'whatsapp';
        rawText: string | null;
        imageUrls: string[];
        audioUrls: string[];
        messageSid: string | null;
    }
): Promise<void> {
    await sql`
        INSERT INTO holding_tank (from_phone, source, raw_text, image_urls, audio_urls, message_sid, status)
        VALUES (
            ${data.fromPhone}, ${data.source}, ${data.rawText},
            ${JSON.stringify(data.imageUrls)}, ${JSON.stringify(data.audioUrls)},
            ${data.messageSid}, 'pending'
        )
    `;
    console.log(`[BucketService] ⏸️ Added to holding tank: ${data.fromPhone}`);
}

// ============================================================================
// Queue Integration
// ============================================================================

/**
 * Queue a closed bucket for final processing
 */
export async function queueBucketForProcessing(bucket: Bucket): Promise<void> {
    const queue = getQueue();

    await queue.enqueue({
        userId: bucket.member_id,
        companyId: bucket.node_id,
        domain: bucket.domain || 'construction',
        source: bucket.source,
        fromPhone: bucket.from_phone,
        textBody: bucket.raw_text || '',
        imageUrl: bucket.image_urls ? JSON.parse(bucket.image_urls)[0] : null,
        audioUrl: bucket.audio_urls ? JSON.parse(bucket.audio_urls)[0] : null,
    });

    console.log(`[BucketService] 📤 Queued bucket #${bucket.id} for processing`);
}
