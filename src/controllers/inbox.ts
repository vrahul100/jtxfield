import { Context } from 'hono';
import { Sql } from 'postgres';
import {
    getInboxEntriesByTag,
    bulkAssignToProject,
    addProjectAlias
} from '../services/bucketService.js';

/**
 * GET /api/inbox/:nodeId
 * View Inbox entries grouped by suspected project name tag
 */
export async function getInbox(c: Context, sql: Sql) {
    try {
        const nodeId = parseInt(c.req.param('nodeId'));

        if (isNaN(nodeId)) {
            return c.json({ error: 'Invalid node ID' }, 400);
        }

        const entries = await getInboxEntriesByTag(sql, nodeId);

        return c.json({
            nodeId,
            totalTags: entries.length,
            totalBuckets: entries.reduce((sum, e) => sum + e.count, 0),
            entries,
        });
    } catch (error: any) {
        console.error('[Inbox API] Get inbox error:', error);
        return c.json({ error: error.message }, 500);
    }
}

/**
 * POST /api/inbox/bulk-assign
 * Bulk assign all buckets with a suspected name tag to a project
 * 
 * Body: { nodeId: number, suspectedName: string, projectId: number }
 */
export async function bulkAssign(c: Context, sql: Sql) {
    try {
        const body = await c.req.json();
        const { nodeId, suspectedName, projectId } = body;

        if (!nodeId || !suspectedName || !projectId) {
            return c.json({ error: 'Missing required fields: nodeId, suspectedName, projectId' }, 400);
        }

        const count = await bulkAssignToProject(sql, nodeId, suspectedName, projectId);

        // Get project name for response
        const projectResult = await sql`SELECT name FROM projects WHERE id = ${projectId}`;
        const projectName = projectResult[0]?.name || 'Unknown';

        return c.json({
            success: true,
            movedCount: count,
            from: 'Inbox',
            to: projectName,
            tag: suspectedName,
            suggestion: {
                message: `Would you like to add "${suspectedName}" as an alias for "${projectName}"?`,
                action: 'POST /api/inbox/add-alias',
                body: { projectId, alias: suspectedName },
            },
        });
    } catch (error: any) {
        console.error('[Inbox API] Bulk assign error:', error);
        return c.json({ error: error.message }, 500);
    }
}

/**
 * POST /api/inbox/add-alias
 * Add an alias to a project for auto-routing
 * 
 * Body: { projectId: number, alias: string }
 */
export async function addAlias(c: Context, sql: Sql) {
    try {
        const body = await c.req.json();
        const { projectId, alias } = body;

        if (!projectId || !alias) {
            return c.json({ error: 'Missing required fields: projectId, alias' }, 400);
        }

        await addProjectAlias(sql, projectId, alias);

        // Get updated project info
        const projectResult = await sql`
      SELECT name, aliases 
      FROM projects 
      WHERE id = ${projectId}
    `;
        const project = projectResult[0];

        const aliases = project?.aliases ? JSON.parse(project.aliases) : [];

        return c.json({
            success: true,
            projectId,
            projectName: project?.name,
            alias,
            totalAliases: aliases.length,
            allAliases: aliases,
        });
    } catch (error: any) {
        console.error('[Inbox API] Add alias error:', error);
        return c.json({ error: error.message }, 500);
    }
}
