import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';

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
        const limit = parseInt(c.req.query('limit') || '20');
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
        const body = await c.req.json();
        const { name, nodeId } = body;

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

        const [project] = await sql`
            INSERT INTO projects (node_id, name, is_active)
            VALUES (${targetNodeId}, ${name}, true)
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
        const body = await c.req.json();
        const { name, isActive, aliases } = body;

        // Convert undefined to null for postgres
        const nameVal = name !== undefined ? name : null;
        const isActiveVal = isActive !== undefined ? isActive : null;
        const aliasesVal = aliases !== undefined ? JSON.stringify(aliases) : null;

        const [project] = await sql`
            UPDATE projects
            SET name = COALESCE(${nameVal}, name),
                is_active = COALESCE(${isActiveVal}, is_active),
                aliases = COALESCE(${aliasesVal}, aliases)
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
 * Soft delete a project (mark as inactive)
 */
export async function deleteProject(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const projectId = parseInt(c.req.param('id'));

        const [project] = await sql`
            UPDATE projects
            SET is_active = false
            WHERE id = ${projectId}
            ${user.role === 'OM' ? sql`AND node_id = ${user.nodeId}` : sql``}
            RETURNING *
        `;

        if (!project) {
            return c.json({ error: 'Project not found or access denied' }, 404);
        }

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Projects] Delete error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
