import { Sql } from 'postgres';
import { extractMessageInfo } from './extractionService.js';
import { getQueue } from '../queue/index.js';
import { getSchemaForDomain, FIELD_QUESTIONS } from '../schemas/domainSchemas.js';

export type BucketStatus = 'open' | 'submitted' | 'pending_review' | 'rejected';

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
    suspected_project_name: string | null; // AI-extracted tag for Inbox sorting
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
    language_preference: string | null;
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
// Inbox Project Logic
// ============================================================================

/**
 * Ensure an Inbox project exists for a node (create if missing)
 * Returns the Inbox project ID
 */
export async function ensureInboxProject(sql: Sql, nodeId: number): Promise<number> {
    const existing = await sql`
        SELECT id FROM projects 
        WHERE node_id = ${nodeId} AND is_inbox = true
        LIMIT 1
    `;

    if (existing.length > 0) {
        return existing[0].id;
    }

    // Create Inbox project
    const [inbox] = await sql`
        INSERT INTO projects (node_id, name, is_inbox, is_active)
        VALUES (${nodeId}, 'Inbox', true, true)
        RETURNING id
    `;

    console.log(`[Inbox] Created Inbox project for node ${nodeId}`);
    return inbox.id;
}

/**
 * Find project by fuzzy matching aliases
 * Checks both project name and aliases array for matches
 */
export async function findProjectByAlias(
    sql: Sql,
    nodeId: number,
    suspectedName: string
): Promise<{ id: number; name: string } | null> {
    if (!suspectedName || suspectedName.trim() === '') {
        return null;
    }

    const normalized = suspectedName.toLowerCase().trim();

    // Get all active projects for the node
    const projects = await sql`
        SELECT id, name, aliases 
        FROM projects 
        WHERE node_id = ${nodeId} 
          AND is_active = true
          AND is_inbox = false
    `;

    for (const project of projects) {
        // Check exact match with project name
        if (project.name.toLowerCase() === normalized) {
            console.log(`[Alias Match] Exact match: "${suspectedName}" → Project "${project.name}"`);
            return { id: project.id, name: project.name };
        }

        // Check aliases if they exist
        if (project.aliases) {
            try {
                const aliases: string[] = JSON.parse(project.aliases);
                for (const alias of aliases) {
                    if (alias.toLowerCase() === normalized) {
                        console.log(`[Alias Match] Alias match: "${suspectedName}" → Project "${project.name}" (via alias "${alias}")`);
                        return { id: project.id, name: project.name };
                    }
                }
            } catch (e) {
                console.error(`[Alias Match] Failed to parse aliases for project ${project.id}`);
            }
        }
    }

    console.log(`[Alias Match] No match found for "${suspectedName}"`);
    return null;
}

/**
 * Get Inbox entries grouped by suspected project name tag
 * Includes all buckets assigned to the Inbox project
 */
export async function getInboxEntriesByTag(
    sql: Sql,
    nodeId: number
): Promise<Array<{ tag: string; count: number; bucketIds: number[] }>> {
    // Get Inbox project ID
    const inboxProjects = await sql`
        SELECT id FROM projects 
        WHERE node_id = ${nodeId} AND is_inbox = true
        LIMIT 1
    `;

    if (inboxProjects.length === 0) {
        return [];
    }

    const inboxId = inboxProjects[0].id;

    // Group buckets by suspected project name (use 'Uncategorized' for nulls)
    const grouped = await sql`
        SELECT 
            COALESCE(suspected_project_name, 'Uncategorized') as tag,
            COUNT(*)::int as count,
            ARRAY_AGG(id) as bucket_ids
        FROM buckets
        WHERE project_id = ${inboxId}
          AND status IN ('open', 'closed', 'completed', 'pending_review')
        GROUP BY COALESCE(suspected_project_name, 'Uncategorized')
        ORDER BY 
            CASE WHEN suspected_project_name IS NULL THEN 1 ELSE 0 END,
            count DESC
    `;

    return grouped.map((g: any) => ({
        tag: g.tag,
        count: g.count,
        bucketIds: g.bucket_ids
    }));
}

/**
 * Bulk assign tagged entries to a project
 * Returns count of updated buckets
 */
export async function bulkAssignToProject(
    sql: Sql,
    nodeId: number,
    suspectedName: string,
    projectId: number
): Promise<number> {
    // Get Inbox project ID
    const inboxProjects = await sql`
        SELECT id FROM projects 
        WHERE node_id = ${nodeId} AND is_inbox = true
        LIMIT 1
    `;

    if (inboxProjects.length === 0) {
        throw new Error('Inbox project not found');
    }

    const inboxId = inboxProjects[0].id;

    // Update all buckets with this suspected name
    const result = await sql`
        UPDATE buckets
        SET project_id = ${projectId}, updated_at = NOW()
        WHERE project_id = ${inboxId}
          AND suspected_project_name = ${suspectedName}
          AND status IN ('open', 'closed', 'completed')
    `;

    console.log(`[Bulk Assign] Moved ${result.count} buckets from Inbox to Project ${projectId}`);
    return result.count;
}

/**
 * Add alias to a project
 */
export async function addProjectAlias(
    sql: Sql,
    projectId: number,
    alias: string
): Promise<void> {
    const [project] = await sql`
        SELECT aliases FROM projects WHERE id = ${projectId}
    `;

    if (!project) {
        throw new Error('Project not found');
    }

    let aliases: string[] = [];
    if (project.aliases) {
        try {
            aliases = JSON.parse(project.aliases);
        } catch (e) {
            console.error(`[Add Alias] Failed to parse existing aliases for project ${projectId}`);
        }
    }

    // Add new alias if not already present
    if (!aliases.some(a => a.toLowerCase() === alias.toLowerCase())) {
        aliases.push(alias);

        await sql`
            UPDATE projects
            SET aliases = ${JSON.stringify(aliases)}, updated_at = NOW()
            WHERE id = ${projectId}
        `;

        console.log(`[Add Alias] Added "${alias}" to project ${projectId} (total: ${aliases.length} aliases)`);
    } else {
        console.log(`[Add Alias] Alias "${alias}" already exists for project ${projectId}`);
    }
}

// ============================================================================
// Open Bucket Logic
// ============================================================================

const BUCKET_TIME_WINDOW_MINUTES = 10; // Time window to group messages into same bucket

/**
 * Find an open bucket for a member within a time window
 * Ignores project ID - if member has ANY open bucket within time window, use it
 * This prevents creating new buckets when multiple media is sent quickly
 */
export async function findOpenBucket(
    sql: Sql,
    memberId: number,
    projectId: number | null // kept for API compatibility but not used for matching
): Promise<Bucket | null> {
    // Find any open bucket for this member created within the time window
    const buckets = await sql`
        SELECT * FROM buckets 
        WHERE member_id = ${memberId}
          AND status = 'open'
          AND created_at > NOW() - INTERVAL '${sql.unsafe(String(BUCKET_TIME_WINDOW_MINUTES))} minutes'
        ORDER BY created_at DESC
        LIMIT 1
    `;

    if (buckets.length > 0) {
        console.log(`[BucketService] Found open bucket #${buckets[0].id} within ${BUCKET_TIME_WINDOW_MINUTES}min window`);
        return buckets[0] as Bucket;
    }

    return null;
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
        suspectedProjectName?: string | null; // NEW: AI-extracted project tag
    }
): Promise<Bucket> {
    const [bucket] = await sql`
        INSERT INTO buckets (
            member_id, node_id, project_id, source, from_phone, raw_text,
            image_urls, audio_urls, transcripts, message_sids, suspected_project_name, status
        )
        VALUES (
            ${data.memberId}, ${data.nodeId}, ${data.projectId}, ${data.source}, ${data.fromPhone},
            ${data.rawText},
            ${JSON.stringify(data.imageUrls)},
            ${JSON.stringify(data.audioUrls)},
            ${JSON.stringify(data.transcripts)},
            ${JSON.stringify(data.messageSid ? [data.messageSid] : [])},
            ${data.suspectedProjectName || null},
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

    // Format new text - if there was a pending question, format as Q&A
    let formattedNewText = data.rawText || '';
    if (bucket.ai_response && formattedNewText) {
        // Format as Q&A conversation
        formattedNewText = `Q: ${bucket.ai_response}\nA: ${formattedNewText}`;
    }

    // Append new data
    const newText = bucket.raw_text
        ? `${bucket.raw_text}\n---\n${formattedNewText}`
        : formattedNewText;

    const [updated] = await sql`
        UPDATE buckets SET
            raw_text = ${newText},
            image_urls = ${JSON.stringify([...existingImages, ...data.imageUrls])},
            audio_urls = ${JSON.stringify([...existingAudio, ...data.audioUrls])},
            transcripts = ${JSON.stringify([...existingTranscripts, ...data.transcripts])},
            message_sids = ${JSON.stringify([...existingSids, ...(data.messageSid ? [data.messageSid] : [])])},
            ai_response = NULL,
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
    questions: string[];  // Conversational prompts to help user
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

    console.log(`[VALIDATE] Bucket #${bucket.id} has ${images.length} image(s), ${transcripts.length} transcript(s)`);
    if (images.length > 0) {
        console.log(`[VALIDATE] Images:`, images);
    }

    const extraction = await extractMessageInfo(
        text,
        transcripts,
        images,
        bucket.domain || 'construction'
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

    // === SCHEMA-BASED VALIDATION ===
    const schema = getSchemaForDomain(extraction.domain);

    // Log extraction result in dev
    console.log(`[VALIDATE] Extraction for bucket #${bucket.id}:`, JSON.stringify(extraction, null, 2));

    const parseResult = schema.safeParse(extraction);

    // Log Zod validation result
    if (parseResult.success) {
        console.log(`[VALIDATE] ✅ Schema validation passed for ${extraction.domain}`);
        console.log(`[VALIDATE] Parsed data:`, JSON.stringify(parseResult.data, null, 2));
    } else {
        console.log(`[VALIDATE] ❌ Schema validation failed for ${extraction.domain}`);
        console.log(`[VALIDATE] Zod errors:`, JSON.stringify(parseResult.error.format(), null, 2));
    }

    const errors: string[] = [];
    const questions: string[] = [];

    // Check for inconsistency first
    if (!extraction.isConsistent && extraction.inconsistencyReason) {
        // Get current attempt count
        const currentAttempts = await sql`SELECT validation_attempts FROM buckets WHERE id = ${bucket.id}`;
        const attempts = currentAttempts[0]?.validation_attempts || 0;

        if (attempts >= 2) {
            // Asked twice - move to pending_review
            console.log(`[VALIDATE] Asked twice about inconsistency, moving to pending_review`);

            await sql`
                UPDATE buckets SET 
                    status = 'pending_review',
                    validation_errors = ${JSON.stringify(['Inconsistency persists'])},
                    updated_at = NOW()
                WHERE id = ${bucket.id}
            `;

            questions.push('📋 Filing for review.');
        } else {
            // First attempt - ask for clarification
            questions.push(`⚠️ The details don't look right. ${extraction.inconsistencyReason}`);

            // Increment attempt count
            await sql`
                UPDATE buckets SET 
                    validation_attempts = validation_attempts + 1,
                    updated_at = NOW()
                WHERE id = ${bucket.id}
            `;

            console.log(`[VALIDATE] Asked inconsistency question (attempt ${attempts + 1}/2)`);
        }

        // Skip schema validation when there's an inconsistency
        const isComplete = false;

        await sql`
            UPDATE buckets SET
                validation_errors = ${JSON.stringify(['Inconsistency detected'])},
                updated_at = NOW()
            WHERE id = ${bucket.id}
        `;

        return {
            isComplete,
            errors: ['Inconsistency between image and description'],
            questions,
            summary: extraction.summary,
        };
    }

    // Only check schema if consistent
    if (!parseResult.success) {
        // Check if we've already asked too many times
        const currentAttempts = await sql`SELECT validation_attempts FROM buckets WHERE id = ${bucket.id}`;
        const attempts = currentAttempts[0]?.validation_attempts || 0;

        if (attempts >= 2) {
            // Asked twice - move to pending_review
            console.log(`[VALIDATE] Asked twice for missing fields, moving to pending_review`);

            await sql`
                UPDATE buckets SET 
                    status = 'pending_review',
                    validation_errors = ${JSON.stringify(['Missing fields after 2 attempts'])},
                    updated_at = NOW()
                WHERE id = ${bucket.id}
            `;

            return {
                isComplete: false,
                errors: ['Missing required fields after 2 attempts'],
                questions: ['📋 Missing details. Filing for review.'],
                summary: extraction.summary,
            };
        }

        // Schema validation failed - extract missing required fields
        const issues = parseResult.error.issues;

        // Increment attempts for schema validation
        await sql`
            UPDATE buckets SET 
                validation_attempts = validation_attempts + 1,
                updated_at = NOW()
            WHERE id = ${bucket.id}
        `;

        for (const issue of issues) {
            const fieldPath = issue.path.join('.');
            const fieldQuestion = FIELD_QUESTIONS[fieldPath];

            if (fieldQuestion) {
                questions.push(fieldQuestion);
            }

            errors.push(`Missing ${fieldPath}: ${issue.message}`);
        }

        console.log(`[VALIDATE] Questions to ask:`, questions);
    }

    // Additional conversational questions based on content
    const hasText = (text || '').trim().length > 0 || transcripts.length > 0;
    const hasImages = images.length > 0;

    if (extraction.clarityScore < 0.6 && questions.length === 0) {
        if (!hasText && hasImages) {
            questions.push('📸 Got the photo! What work did you do?');
        } else if (hasText && !hasImages) {
            questions.push('📝 Can you send a photo of the completed work?');
        } else {
            questions.push('🤔 What specific work was done?');
        }
    }

    const isComplete = parseResult.success && errors.length === 0 && extraction.clarityScore >= 0.6;

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
        questions,
        summary: extraction.summary,
    };
}

/**
 * Close a bucket (mark as submitted)
 */
export async function closeBucket(sql: Sql, bucketId: number): Promise<void> {
    await sql`
        UPDATE buckets SET status = 'submitted', updated_at = NOW()
        WHERE id = ${bucketId}
    `;
    console.log(`[BucketService] ✅ Submitted bucket #${bucketId}`);
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
