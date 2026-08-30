import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';
import { getRequestBody } from '../utils/request.js';

/**
 * GET /api/worklog
 * Get buckets with filters, sorting, pagination, and search
 * OM: only their node, SU: all nodes
 */
export async function getWorklog(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');

        // Query params
        const nodeId = c.req.query('nodeId');
        const status = c.req.query('status');
        const projectId = c.req.query('projectId');
        const memberId = c.req.query('memberId');
        const potentialChange = c.req.query('potentialChange');
        const isFlagged = c.req.query('isFlagged');
        const flagType = c.req.query('flagType');
        const search = c.req.query('search') || '';
        const page = parseInt(c.req.query('page') || '1');
        const limit = parseInt(c.req.query('limit') || '20');
        const offset = (page - 1) * limit;
        const sortBy = c.req.query('sortBy') || 'created_at';
        const order = c.req.query('order') || 'desc';

        // Build WHERE clause based on role
        let conditions: string[] = [];
        if (user.role === 'OM') {
            // OM can only see their node
            conditions.push(`b.node_id = ${user.nodeId}`);
        } else if (nodeId) {
            // SU can filter by node
            conditions.push(`b.node_id = ${parseInt(nodeId)}`);
        }

        if (status) {
            if (status === 'flagged') {
                conditions.push(`(b.is_flagged = true OR b.status = 'flagged' OR b.status = 'pending_review')`);
            } else {
                conditions.push(`b.status = '${status}'`);
            }
        }
        if (projectId) {
            conditions.push(`b.project_id = ${parseInt(projectId)}`);
        }
        if (memberId) {
            conditions.push(`b.member_id = ${parseInt(memberId)}`);
        }
        if (potentialChange === 'true') {
            conditions.push(`b.potential_change = true`);
        } else if (potentialChange === 'false') {
            conditions.push(`(b.potential_change = false OR b.potential_change IS NULL)`);
        }
        if (isFlagged === 'true') {
            conditions.push(`b.is_flagged = true`);
        } else if (isFlagged === 'false') {
            conditions.push(`(b.is_flagged = false OR b.is_flagged IS NULL)`);
        }
        if (flagType) {
            conditions.push(`b.flag_type = '${flagType.replace(/'/g, "''")}'`);
        }

        // Search across ID, member name, project name, raw text, AI summary, and transcripts
        if (search.trim()) {
            const searchTerm = search.trim().replace(/'/g, "''");
            // Check if search term is a number (for ID search)
            const isNumeric = /^\d+$/.test(searchTerm);
            if (isNumeric) {
                // Numeric search: only match ID exactly, or in text fields (not phone)
                conditions.push(`(
                    b.id = ${parseInt(searchTerm)}
                    OR m.full_name ILIKE '%${searchTerm}%' 
                    OR p.name ILIKE '%${searchTerm}%'
                    OR b.raw_text ILIKE '%${searchTerm}%'
                    OR b.summary ILIKE '%${searchTerm}%'
                    OR b.transcripts::text ILIKE '%${searchTerm}%'
                )`);
            } else {
                // Text search: include phone numbers for text queries
                conditions.push(`(
                    m.full_name ILIKE '%${searchTerm}%' 
                    OR m.phone_number ILIKE '%${searchTerm}%'
                    OR p.name ILIKE '%${searchTerm}%'
                    OR b.raw_text ILIKE '%${searchTerm}%'
                    OR b.summary ILIKE '%${searchTerm}%'
                    OR b.transcripts::text ILIKE '%${searchTerm}%'
                )`);
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const orderClause = `ORDER BY b.${sortBy} ${order.toUpperCase()}`;

        // Get total count
        const countResult = await sql.unsafe(`
            SELECT COUNT(*)::int as total
            FROM buckets b
            LEFT JOIN projects p ON b.project_id = p.id
            LEFT JOIN members m ON b.member_id = m.id
            ${whereClause}
        `);
        const total = countResult[0]?.total || 0;

        // Get buckets with joins and pagination
        const buckets = await sql.unsafe(`
            SELECT 
                b.id,
                b.raw_text,
                b.summary,
                b.image_urls,
                b.audio_urls,
                b.transcripts,
                b.ai_response,
                b.status,
                b.type,
                b.clarity_score,
                b.extracted_data,
                b.potential_change,
                b.hours,
                b.is_flagged,
                b.flag_type,
                b.flag_reason,
                b.reviewed_by,
                b.reviewed_at,
                b.created_at,
                b.updated_at,
                b.wa_sent_timestamp,
                b.wa_received_timestamp,
                b.node_id,
                b.project_id,
                b.member_id,
                p.name as project_name,
                m.full_name as member_name,
                m.phone_number as member_phone,
                m.role as worker_role,
                n.name as node_name,
                n.default_hourly_rate as base_rate,
                COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)::numeric as node_rate,
                COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)::numeric as worker_rate
            FROM buckets b
            LEFT JOIN projects p ON b.project_id = p.id
            LEFT JOIN members m ON b.member_id = m.id
            LEFT JOIN nodes n ON b.node_id = n.id
            LEFT JOIN rate_cards rc ON rc.company_id = b.node_id 
                AND LOWER(rc.position_name) = LOWER(COALESCE(m.role, 'General Labor'))
            ${whereClause}
            ${orderClause}
            LIMIT ${limit} OFFSET ${offset}
        `);

        return c.json({
            buckets,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        console.error('[Tickets] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * GET /api/worklog/:id
 * Get single worklog/ticket details by ID
 */
export async function getWorklogById(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const bucketId = parseInt(c.req.param('id'));

        let conditions = [`b.id = ${bucketId}`];
        if (user.role === 'OM') {
            conditions.push(`b.node_id = ${user.nodeId}`);
        }

        const [bucket] = await sql.unsafe(`
            SELECT 
                b.*,
                p.name as project_name,
                m.full_name as member_name,
                m.phone_number as member_phone,
                m.role as worker_role,
                n.name as node_name,
                n.default_hourly_rate as base_rate,
                COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)::numeric as node_rate,
                COALESCE(rc.hourly_rate, n.default_hourly_rate, 85.00)::numeric as worker_rate,
                t.location,
                t.material,
                t.labor
            FROM buckets b
            LEFT JOIN projects p ON b.project_id = p.id
            LEFT JOIN members m ON b.member_id = m.id
            LEFT JOIN nodes n ON b.node_id = n.id
            LEFT JOIN rate_cards rc ON rc.company_id = b.node_id 
                AND LOWER(rc.position_name) = LOWER(COALESCE(m.role, 'General Labor'))
            LEFT JOIN txns t ON b.id = t.bucket_id
            WHERE ${conditions.join(' AND ')}
        `);

        if (!bucket) {
            return c.json({ error: 'Bucket not found' }, 404);
        }

        return c.json({ bucket });
    } catch (error: any) {
        console.error('[Tickets] GetById error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/worklog/:id/approve
 * Approve/complete a bucket
 */
export async function approveBucket(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const bucketId = parseInt(c.req.param('id'));

        // Get bucket
        const buckets = await sql`SELECT * FROM buckets WHERE id = ${bucketId}`;
        if (buckets.length === 0) {
            return c.json({ error: 'Bucket not found' }, 404);
        }

        const bucket = buckets[0];

        // OM can only approve their node's buckets
        if (user.role === 'OM' && bucket.node_id !== user.nodeId) {
            return c.json({ error: 'Forbidden' }, 403);
        }

        // Update status to submitted and resolve flag
        await sql`
            UPDATE buckets 
            SET status = 'submitted',
                is_flagged = false,
                reviewed_by = ${user.id},
                reviewed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${bucketId}
        `;

        console.log(`[Tickets] Bucket #${bucketId} approved by user ${user.id}`);

        // Extract transaction asynchronously (don't wait for it)
        import('../services/transactionService.js').then(({ extractTransactionFromBucket }) => {
            extractTransactionFromBucket(sql, bucketId).catch((err) => {
                console.error(`[Tickets] Failed to extract transaction for bucket #${bucketId}:`, err);
            });
        });

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Tickets] Approve error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * PUT /api/worklog/:id
 * Update a bucket's raw_text, project_id, and/or potential_change
 */
export async function updateBucket(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const bucketId = parseInt(c.req.param('id'));
        const body = await getRequestBody(c);
        const { rawText, summary, projectId, potential_change, hours, is_flagged, flag_type, flag_reason } = body;

        // Get bucket
        const buckets = await sql`SELECT * FROM buckets WHERE id = ${bucketId}`;
        if (buckets.length === 0) {
            return c.json({ error: 'Bucket not found' }, 404);
        }

        const bucket = buckets[0];

        // OM can only update their node's buckets
        if (user.role === 'OM' && bucket.node_id !== user.nodeId) {
            return c.json({ error: 'Forbidden' }, 403);
        }

        // Build dynamic update based on what's provided
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (rawText !== undefined) {
            updates.push(`raw_text = $${paramIndex++}`);
            values.push(rawText);
        }
        if (summary !== undefined) {
            updates.push(`summary = $${paramIndex++}`);
            values.push(summary);
        }
        if (projectId !== undefined) {
            updates.push(`project_id = $${paramIndex++}`);
            values.push(projectId);
        }
        if (potential_change !== undefined) {
            updates.push(`potential_change = $${paramIndex++}`);
            values.push(potential_change);
        }
        if (hours !== undefined) {
            updates.push(`hours = $${paramIndex++}`);
            values.push(hours);
        }
        if (is_flagged !== undefined) {
            updates.push(`is_flagged = $${paramIndex++}`);
            values.push(is_flagged);
            if (is_flagged === false) {
                updates.push(`reviewed_by = $${paramIndex++}`);
                values.push(user.id);
                updates.push(`reviewed_at = NOW()`);
            }
        }
        if (flag_type !== undefined) {
            updates.push(`flag_type = $${paramIndex++}`);
            values.push(flag_type);
        }
        if (flag_reason !== undefined) {
            updates.push(`flag_reason = $${paramIndex++}`);
            values.push(flag_reason);
        }

        if (updates.length === 0) {
            return c.json({ error: 'At least one field (rawText, projectId, potential_change, hours) is required' }, 400);
        }

        updates.push('updated_at = NOW()');
        values.push(bucketId);

        const query = `UPDATE buckets SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
        await sql.unsafe(query, values);

        console.log(`[Tickets] Bucket #${bucketId} updated by user ${user.id}`);

        // Notification logic for hours change
        if (hours !== undefined && parseFloat(hours) !== parseFloat(bucket.hours || '0')) {
            try {
                const [member] = await sql`SELECT phone_number, language_preference FROM members WHERE id = ${bucket.member_id}`;
                if (member && member.phone_number) {
                    const todayRes = await sql`
                        SELECT COALESCE(SUM(hours), 0) as today_hours
                        FROM buckets
                        WHERE member_id = ${bucket.member_id}
                        AND DATE(created_at) = CURRENT_DATE
                        AND status != 'rejected'
                        AND id != ${bucketId}
                    `;
                    const newTotal = parseFloat(todayRes[0].today_hours) + parseFloat(hours);
                    
                    import('../services/twilio.js').then(({ sendTwilioMessage }) => {
                        const msg = member.language_preference === 'es' 
                            ? `⚠️ Ticket #${bucketId}: las horas fueron ajustadas a ${hours}h por el manager. Total de hoy: ${newTotal}h.`
                            : `⚠️ Ticket #${bucketId}: hours adjusted to ${hours}h by manager. Today revised: ${newTotal}h.`;
                        
                        sendTwilioMessage(member.phone_number, msg).catch(err => {
                            console.error('[Tickets] Failed to notify worker:', err);
                        });
                    });
                }
            } catch (err) {
                console.error('[Tickets] Notification error:', err);
            }
        }

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Tickets] Update error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/worklog/:id/reject
 * Reject a bucket (mark as closed/rejected)
 */
export async function rejectBucket(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const bucketId = parseInt(c.req.param('id'));

        // Get bucket
        const buckets = await sql`SELECT * FROM buckets WHERE id = ${bucketId}`;
        if (buckets.length === 0) {
            return c.json({ error: 'Bucket not found' }, 404);
        }

        const bucket = buckets[0];

        // OM can only reject their node's buckets
        if (user.role === 'OM' && bucket.node_id !== user.nodeId) {
            return c.json({ error: 'Forbidden' }, 403);
        }

        // Update status to rejected
        await sql`
            UPDATE buckets 
            SET status = 'rejected',
                updated_at = NOW()
            WHERE id = ${bucketId}
        `;

        console.log(`[Tickets] Bucket #${bucketId} rejected by user ${user.id}`);

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Tickets] Reject error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
