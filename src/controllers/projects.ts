import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';
import { getRequestBody } from '../utils/request.js';

/**
 * GET /api/projects
 * Get projects list with pagination and search
 */
export async function getProjects(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const nodeId = c.req.query('nodeId');
        const search = c.req.query('search') || '';
        const page = parseInt(c.req.query('page') || '1');
        const limit = parseInt(c.req.query('limit') || '10');
        const offset = (page - 1) * limit;

        // Build conditions
        let conditions: string[] = [];

        if (user.role === 'OM') {
            conditions.push(`p.node_id = ${user.nodeId}`);
        } else if (nodeId) {
            conditions.push(`p.node_id = ${parseInt(nodeId)}`);
        }

        if (search.trim()) {
            const searchTerm = search.trim().replace(/'/g, "''");
            conditions.push(`(p.name ILIKE '%${searchTerm}%' OR p.aliases ILIKE '%${searchTerm}%')`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await sql.unsafe(`
            SELECT COUNT(*)::int as total
            FROM projects p
            ${whereClause}
        `);
        const total = countResult[0]?.total || 0;

        // Get projects with pagination
        const projects = await sql.unsafe(`
            SELECT p.*, n.name as node_name
            FROM projects p
            LEFT JOIN nodes n ON p.node_id = n.id
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `);

        return c.json({
            projects,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        console.error('[Projects] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/projects
 * Create a new project
 */
export async function createProject(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const body = await getRequestBody(c);
        const { name, nodeId, radius } = body;

        if (!name) {
            return c.json({ error: 'Project name is required' }, 400);
        }

        // Determine node_id
        let targetNodeId;
        if (user.role === 'OM') {
            targetNodeId = user.nodeId;
        } else {
            if (!nodeId) {
                return c.json({ error: 'Node ID is required for Super User' }, 400);
            }
            targetNodeId = nodeId;
        }

        const radiusVal = radius !== undefined && radius !== '' ? parseInt(radius, 10) : null;

        const [project] = await sql`
            INSERT INTO projects (node_id, name, is_active, radius)
            VALUES (${targetNodeId}, ${name}, true, ${radiusVal})
            RETURNING *
        `;

        return c.json({ project });
    } catch (error: any) {
        console.error('[Projects] Create error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * PUT /api/projects/:id
 * Update a project
 */
export async function updateProject(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const projectId = parseInt(c.req.param('id'));
        const body = await getRequestBody(c);
        const { name, isActive, aliases, nodeId, radius } = body;

        // Convert undefined to null for postgres
        const nameVal = name ?? null;
        const isActiveVal = isActive ?? null;
        const aliasesVal = aliases ?? null;
        const nodeIdVal = nodeId ?? null;
        
        let radiusUpdate = sql``;
        if (radius !== undefined) {
            const radiusVal = radius === '' || radius === null ? null : parseInt(radius, 10);
            radiusUpdate = sql`, radius = ${radiusVal}`;
        }

        // SU can change node_id, OM cannot
        const [project] = await sql`
            UPDATE projects
            SET name = COALESCE(${nameVal}, name),
                is_active = COALESCE(${isActiveVal}, is_active),
                aliases = COALESCE(${aliasesVal}, aliases)
                ${radiusUpdate}
                ${user.role === 'SU' && nodeIdVal ? sql`, node_id = ${nodeIdVal}` : sql``}
            WHERE id = ${projectId}
            ${user.role === 'OM' ? sql`AND node_id = ${user.nodeId}` : sql``}
            RETURNING *
        `;

        if (!project) {
            return c.json({ error: 'Project not found or access denied' }, 404);
        }

        return c.json({ project });
    } catch (error: any) {
        console.error('[Projects] Update error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * DELETE /api/projects/:id
 * Hard delete a project (only if no associated tickets)
 */
export async function deleteProject(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const projectId = parseInt(c.req.param('id'));

        // Check if project has any associated buckets/tickets
        const [ticketCount] = await sql`
            SELECT COUNT(*)::int as count FROM buckets WHERE project_id = ${projectId}
        `;

        if (ticketCount.count > 0) {
            return c.json({
                error: `Cannot delete: project has ${ticketCount.count} associated ticket(s)`
            }, 400);
        }

        // Check access for OM users
        if (user.role === 'OM') {
            const [project] = await sql`
                SELECT id FROM projects WHERE id = ${projectId} AND node_id = ${user.nodeId}
            `;
            if (!project) {
                return c.json({ error: 'Project not found or access denied' }, 404);
            }
        }

        // Hard delete the project
        const [deleted] = await sql`
            DELETE FROM projects WHERE id = ${projectId} RETURNING id
        `;

        if (!deleted) {
            return c.json({ error: 'Project not found' }, 404);
        }

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Projects] Delete error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
