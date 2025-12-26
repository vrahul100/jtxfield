import { Context } from 'hono';
import { Sql } from 'postgres';

/**
 * GET /api/nodes
 * Get all nodes (SU only)
 */
export async function getNodes(c: Context, sql: Sql) {
    try {
        const nodes = await sql`
            SELECT n.*, 
                   COUNT(DISTINCT m.id) as member_count,
                   COUNT(DISTINCT p.id) as project_count
            FROM nodes n
            LEFT JOIN members m ON n.id = m.company_id
            LEFT JOIN projects p ON n.id = p.node_id
            GROUP BY n.id
            ORDER BY n.created_at DESC
        `;

        return c.json({ nodes });
    } catch (error: any) {
        console.error('[Nodes] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/nodes
 * Create a new node (SU only)
 */
export async function createNode(c: Context, sql: Sql) {
    try {
        const body = await c.req.json();
        const { name, defaultHourlyRate } = body;

        if (!name) {
            return c.json({ error: 'Node name is required' }, 400);
        }

        const [node] = await sql`
            INSERT INTO nodes (name, default_hourly_rate)
            VALUES (${name}, ${defaultHourlyRate || '85.00'})
            RETURNING *
        `;

        // Create Inbox project for new node
        await sql`
            INSERT INTO projects (node_id, name, is_inbox, is_active)
            VALUES (${node.id}, 'Inbox', true, true)
        `;

        return c.json({ node });
    } catch (error: any) {
        console.error('[Nodes] Create error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * PUT /api/nodes/:id
 * Update a node (SU only)
 */
export async function updateNode(c: Context, sql: Sql) {
    try {
        const nodeId = parseInt(c.req.param('id'));
        const body = await c.req.json();
        const { name, defaultHourlyRate } = body;

        const [node] = await sql`
            UPDATE nodes
            SET name = COALESCE(${name}, name),
                default_hourly_rate = COALESCE(${defaultHourlyRate}, default_hourly_rate)
            WHERE id = ${nodeId}
            RETURNING *
        `;

        if (!node) {
            return c.json({ error: 'Node not found' }, 404);
        }

        return c.json({ node });
    } catch (error: any) {
        console.error('[Nodes] Update error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
