import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';

/**
 * GET /api/projects
 * Get projects list
 */
export async function getProjects(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const nodeId = c.req.query('nodeId');

        let projects;
        if (user.role === 'OM') {
            // OM sees only their node's projects
            projects = await sql`
                SELECT * FROM projects 
                WHERE node_id = ${user.nodeId}
                ORDER BY created_at DESC
            `;
        } else {
            // SU sees projects for selected node or all
            projects = nodeId
                ? await sql`SELECT * FROM projects WHERE node_id = ${parseInt(nodeId)} ORDER BY created_at DESC`
                : await sql`SELECT p.*, n.name as node_name FROM projects p LEFT JOIN nodes n ON p.node_id = n.id ORDER BY p.created_at DESC`;
        }

        return c.json({ projects });
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

        const [project] = await sql`
            UPDATE projects
            SET name = COALESCE(${name}, name),
                is_active = COALESCE(${isActive}, is_active),
                aliases = COALESCE(${aliases ? JSON.stringify(aliases) : null}, aliases)
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
