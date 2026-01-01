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
        const limit = parseInt(c.req.query('limit') || '20');
        const offset = (page - 1) * limit;

        // Build conditions
        let conditions: string[] = [];

        // Filter by node for OM users
        if (user.role === 'OM') {
            conditions.push(`t.company_id = ${user.nodeId}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await sql.unsafe(`
            SELECT COUNT(*)::int as total
            FROM txns t
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
