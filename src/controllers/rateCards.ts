import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';

/**
 * GET /api/rate-cards
 * Get rate cards for a node, including default base rate
 */
export async function getRateCards(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        let nodeId = user.nodeId;

        if (user.role === 'SU') {
            const queryNodeId = c.req.query('nodeId');
            if (queryNodeId) {
                nodeId = parseInt(queryNodeId);
            } else if (!nodeId) {
                const [firstNode] = await sql`SELECT id FROM nodes ORDER BY id ASC LIMIT 1`;
                nodeId = firstNode?.id || null;
            }
        }

        if (!nodeId) {
            return c.json({ error: 'No node selected or available' }, 400);
        }

        const [node] = await sql`
            SELECT id, name, default_hourly_rate
            FROM nodes
            WHERE id = ${nodeId}
        `;

        if (!node) {
            return c.json({ error: 'Node not found' }, 404);
        }

        const rateCards = await sql`
            SELECT id, company_id as node_id, position_name as role, hourly_rate, created_at, updated_at
            FROM rate_cards
            WHERE company_id = ${nodeId}
            ORDER BY position_name ASC
        `;

        // Also fetch all distinct roles used across members for suggestions
        const memberRoles = await sql`
            SELECT DISTINCT role
            FROM members
            WHERE company_id = ${nodeId} AND role IS NOT NULL AND role != ''
            ORDER BY role ASC
        `;

        return c.json({
            nodeId: node.id,
            nodeName: node.name,
            baseRate: parseFloat(node.default_hourly_rate || '85.00'),
            rateCards: rateCards.map(rc => ({
                id: rc.id,
                nodeId: rc.node_id,
                role: rc.role,
                hourlyRate: parseFloat(rc.hourly_rate),
                createdAt: rc.created_at,
                updatedAt: rc.updated_at,
            })),
            suggestedRoles: memberRoles.map(r => r.role),
        });
    } catch (error: any) {
        console.error('[RateCards] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/rate-cards
 * Create or update a role rate on a node's rate card
 */
export async function upsertRateCard(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const body = await c.req.json();
        let nodeId = user.nodeId;

        if (user.role === 'SU' && body.nodeId) {
            nodeId = parseInt(body.nodeId);
        }

        if (!nodeId) {
            return c.json({ error: 'Node ID is required' }, 400);
        }

        const role = (body.role || '').trim();
        const hourlyRate = parseFloat(body.hourlyRate);

        if (!role) {
            return c.json({ error: 'Role name is required' }, 400);
        }

        if (isNaN(hourlyRate) || hourlyRate <= 0) {
            return c.json({ error: 'Valid hourly rate greater than 0 is required' }, 400);
        }

        const [rateCard] = await sql`
            INSERT INTO rate_cards (company_id, position_name, hourly_rate, updated_at)
            VALUES (${nodeId}, ${role}, ${hourlyRate}, NOW())
            ON CONFLICT (company_id, position_name)
            DO UPDATE SET hourly_rate = EXCLUDED.hourly_rate, updated_at = NOW()
            RETURNING id, company_id as node_id, position_name as role, hourly_rate, created_at, updated_at
        `;

        return c.json({
            message: `Rate for "${role}" saved successfully`,
            rateCard: {
                id: rateCard.id,
                nodeId: rateCard.node_id,
                role: rateCard.role,
                hourlyRate: parseFloat(rateCard.hourly_rate),
                createdAt: rateCard.created_at,
                updatedAt: rateCard.updated_at,
            }
        });
    } catch (error: any) {
        console.error('[RateCards] Upsert error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * DELETE /api/rate-cards/:id
 * Delete a role rate card entry (worker with this role reverts to base rate)
 */
export async function deleteRateCard(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const id = parseInt(c.req.param('id'));

        if (!id) {
            return c.json({ error: 'Valid rate card ID is required' }, 400);
        }

        let deleteQuery = sql`
            DELETE FROM rate_cards
            WHERE id = ${id}
            ${user.role === 'OM' ? sql`AND company_id = ${user.nodeId}` : sql``}
            RETURNING id, position_name
        `;

        const [deleted] = await deleteQuery;

        if (!deleted) {
            return c.json({ error: 'Rate card entry not found or access denied' }, 404);
        }

        return c.json({
            message: `Rate for "${deleted.position_name}" deleted. Workers will now use node base rate.`,
            id: deleted.id
        });
    } catch (error: any) {
        console.error('[RateCards] Delete error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * PUT /api/rate-cards/base-rate
 * Update node's default base hourly rate
 */
export async function updateBaseRate(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const body = await c.req.json();
        let nodeId = user.nodeId;

        if (user.role === 'SU' && body.nodeId) {
            nodeId = parseInt(body.nodeId);
        }

        if (!nodeId) {
            return c.json({ error: 'Node ID is required' }, 400);
        }

        const baseRate = parseFloat(body.baseRate);

        if (isNaN(baseRate) || baseRate <= 0) {
            return c.json({ error: 'Valid base rate greater than 0 is required' }, 400);
        }

        const [updatedNode] = await sql`
            UPDATE nodes
            SET default_hourly_rate = ${baseRate}
            WHERE id = ${nodeId}
            RETURNING id, name, default_hourly_rate
        `;

        if (!updatedNode) {
            return c.json({ error: 'Node not found' }, 404);
        }

        return c.json({
            message: 'Default base hourly rate updated',
            baseRate: parseFloat(updatedNode.default_hourly_rate)
        });
    } catch (error: any) {
        console.error('[RateCards] Update base rate error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
