import { Hono } from 'hono';
import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';

/**
 * GET /api/transactions
 * Get transactions list with pagination and filters
 */
export async function getTransactions(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const page = parseInt(c.req.query('page') || '1');
        const limit = parseInt(c.req.query('limit') || '10');
        const status = c.req.query('status');
        const projectId = c.req.query('projectId');
        const search = c.req.query('search') || '';
        const offset = (page - 1) * limit;

        // Build conditions
        let conditions: string[] = [];

        // Filter by node for OM users
        if (user.role === 'OM') {
            conditions.push(`t.company_id = ${user.nodeId}`);
        }

        if (status && status !== 'all') {
            conditions.push(`t.status = '${status}'`);
        }
        if (projectId && projectId !== 'all') {
            conditions.push(`t.project_id = ${parseInt(projectId)}`);
        }

        if (search.trim()) {
            const searchTerm = search.trim().replace(/'/g, "''");
            const isNumeric = /^\d+$/.test(searchTerm);
            if (isNumeric) {
                conditions.push(`(
                    t.id = ${parseInt(searchTerm)}
                    OR m.full_name ILIKE '%${searchTerm}%' 
                    OR m.phone_number ILIKE '%${searchTerm}%'
                    OR p.name ILIKE '%${searchTerm}%'
                    OR t.job ILIKE '%${searchTerm}%'
                )`);
            } else {
                conditions.push(`(
                    m.full_name ILIKE '%${searchTerm}%' 
                    OR m.phone_number ILIKE '%${searchTerm}%'
                    OR p.name ILIKE '%${searchTerm}%'
                    OR t.job ILIKE '%${searchTerm}%'
                )`);
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await sql.unsafe(`
            SELECT COUNT(*)::int as total
            FROM txns t
            LEFT JOIN members m ON t.user_id = m.id
            LEFT JOIN projects p ON t.project_id = p.id
            ${whereClause}
        `);
        const total = countResult[0]?.total || 0;

        // Get transactions with joins
        const transactions = await sql.unsafe(`
            SELECT 
                t.*,
                m.full_name as member_name,
                m.phone_number as member_phone,
                p.name as project_name,
                n.name as node_name
            FROM txns t
            LEFT JOIN members m ON t.user_id = m.id
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN nodes n ON t.company_id = n.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `);

        return c.json({
            transactions,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        console.error('[Transactions] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * PUT /api/transactions/:id
 * Update a transaction
 */
export async function updateTransaction(c: Context, sql: Sql) {
    const id = Number(c.req.param('id'));
    const { labor, material, projectId, time } = await c.req.json();

    try {
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (labor !== undefined) {
            updateFields.push('labor = $' + (updateValues.length + 1));
            updateValues.push(labor);
        }

        if (material !== undefined) {
            updateFields.push('material = $' + (updateValues.length + 1));
            updateValues.push(material);
        }

        if (projectId !== undefined) {
            updateFields.push('project_id = $' + (updateValues.length + 1));
            updateValues.push(projectId);
        }

        if (time !== undefined) {
            updateFields.push('time = $' + (updateValues.length + 1));
            updateValues.push(time ? Number(time) : null);
        }

        if (updateFields.length === 0) {
            return c.json({ error: 'No fields to update' }, 400);
        }

        updateValues.push(id);
        const query = `UPDATE txns SET ${updateFields.join(', ')} WHERE id = $${updateValues.length} RETURNING *`;

        const result = await sql.unsafe(query, updateValues);

        if (result.length === 0) {
            return c.json({ error: 'Transaction not found' }, 404);
        }

        return c.json({ success: true, transaction: result[0] });
    } catch (error) {
        console.error('[Transactions] Update failed:', error);
        return c.json({ error: 'Failed to update transaction' }, 500);
    }
}

export default function transactionsController(sql: Sql) {
    const router = new Hono();

    router.get('/', (c) => getTransactions(c, sql));
    router.put('/:id', (c) => updateTransaction(c, sql));

    return router;
}
