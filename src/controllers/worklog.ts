import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';

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
        const sortBy = c.req.query('sortBy') || 'created_at';
        const order = c.req.query('order') || 'desc';
        const search = c.req.query('search') || '';
        const page = parseInt(c.req.query('page') || '1');
        const limit = parseInt(c.req.query('limit') || '10');
        const offset = (page - 1) * limit;

        // Build WHERE clause based on role
        let conditions = [];
        if (user.role === 'OM') {
            // OM can only see their node
            conditions.push(`b.node_id = ${user.nodeId}`);
        } else if (nodeId) {
            // SU can filter by node
            conditions.push(`b.node_id = ${parseInt(nodeId)}`);
        }

        if (status) {
            conditions.push(`b.status = '${status}'`);
        }
        if (projectId) {
            conditions.push(`b.project_id = ${parseInt(projectId)}`);
        }
        if (memberId) {
            conditions.push(`b.member_id = ${parseInt(memberId)}`);
        }

        // Search across ID, member name, phone, project name, and raw text
        if (search.trim()) {
            const searchTerm = search.trim().replace(/'/g, "''");
            // Check if search term is a number (for ID search)
            const isNumeric = /^\d+$/.test(searchTerm);
            if (isNumeric) {
                conditions.push(`(
                    b.id = ${parseInt(searchTerm)}
                    OR m.full_name ILIKE '%${searchTerm}%' 
                    OR m.phone_number ILIKE '%${searchTerm}%'
                    OR p.name ILIKE '%${searchTerm}%'
                    OR b.raw_text ILIKE '%${searchTerm}%'
                )`);
            } else {
                conditions.push(`(
                    m.full_name ILIKE '%${searchTerm}%' 
                    OR m.phone_number ILIKE '%${searchTerm}%'
                    OR p.name ILIKE '%${searchTerm}%'
                    OR b.raw_text ILIKE '%${searchTerm}%'
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
                b.*,
                p.name as project_name,
                m.full_name as member_name,
                m.phone_number as member_phone,
                n.name as node_name
            FROM buckets b
            LEFT JOIN projects p ON b.project_id = p.id
            LEFT JOIN members m ON b.member_id = m.id
            LEFT JOIN nodes n ON b.node_id = n.id
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

        // Update status to submitted
        await sql`
            UPDATE buckets 
            SET status = 'submitted',
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
 * Update a bucket's raw_text and/or project_id
 */
export async function updateBucket(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const bucketId = parseInt(c.req.param('id'));
        const body = await c.req.json();
        const { rawText, projectId } = body;

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

        // Build update query based on what's provided
        if (rawText !== undefined && projectId !== undefined) {
            await sql`
                UPDATE buckets 
                SET raw_text = ${rawText},
                    project_id = ${projectId},
                    updated_at = NOW()
                WHERE id = ${bucketId}
            `;
        } else if (rawText !== undefined) {
            await sql`
                UPDATE buckets 
                SET raw_text = ${rawText},
                    updated_at = NOW()
                WHERE id = ${bucketId}
            `;
        } else if (projectId !== undefined) {
            await sql`
                UPDATE buckets 
                SET project_id = ${projectId},
                    updated_at = NOW()
                WHERE id = ${bucketId}
            `;
        } else {
            return c.json({ error: 'rawText or projectId is required' }, 400);
        }

        console.log(`[Tickets] Bucket #${bucketId} updated by user ${user.id}`);

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
