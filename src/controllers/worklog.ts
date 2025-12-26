import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';

/**
 * GET /api/worklog
 * Get buckets with filters and sorting
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

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const orderClause = `ORDER BY b.${sortBy} ${order.toUpperCase()}`;

        // Get buckets with joins
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
            LIMIT 100
        `);

        return c.json({
            buckets,
            total: buckets.length,
        });
    } catch (error: any) {
        console.error('[Worklog] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
