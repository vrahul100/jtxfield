import { Context } from 'hono';
import { Sql } from 'postgres';
import { createUser, getUsers, updateUser, updateUserPassword } from '../services/auth.js';

/**
 * GET /api/users
 * Get all users (SU only)
 */
export async function getUsersList(c: Context, sql: Sql) {
    try {
        const users = await getUsers(sql);

        // Remove password hashes
        const sanitizedUsers = users.map(u => ({
            id: u.id,
            email: u.email,
            role: u.role,
            nodeId: u.nodeId,
            fullName: u.fullName,
            isActive: u.isActive,
            createdAt: u.createdAt,
        }));

        return c.json({ users: sanitizedUsers });
    } catch (error: any) {
        console.error('[Users] Get error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/users
 * Create a new user (SU only)
 */
export async function createNewUser(c: Context, sql: Sql) {
    try {
        const body = await c.req.json();
        const { email, password, role, nodeId, fullName } = body;

        if (!email || !password || !role) {
            return c.json({ error: 'Email, password, and role are required' }, 400);
        }

        if (role !== 'OM' && role !== 'SU') {
            return c.json({ error: 'Role must be OM or SU' }, 400);
        }

        if (role === 'OM' && !nodeId) {
            return c.json({ error: 'Node ID is required for Office Managers' }, 400);
        }

        const user = await createUser(sql, {
            email,
            password,
            role,
            nodeId: role === 'OM' ? nodeId : null,
            fullName,
        });

        // Return without password hash
        return c.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                nodeId: user.nodeId,
                fullName: user.fullName,
                isActive: user.isActive,
            },
        });
    } catch (error: any) {
        console.error('[Users] Create error:', error);
        if (error.message?.includes('unique')) {
            return c.json({ error: 'Email already exists' }, 400);
        }
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * PUT /api/users/:id
 * Update a user (SU only)
 */
export async function updateUserInfo(c: Context, sql: Sql) {
    try {
        const userId = parseInt(c.req.param('id'));
        const body = await c.req.json();
        const { email, fullName, nodeId, isActive, password } = body;

        // Update basic info
        if (email || fullName || nodeId !== undefined || isActive !== undefined) {
            await updateUser(sql, userId, {
                email,
                fullName,
                nodeId,
                isActive,
            });
        }

        // Update password if provided
        if (password) {
            await updateUserPassword(sql, userId, password);
        }

        // Get updated user
        const users = await sql`SELECT * FROM users WHERE id = ${userId}`;
        const user = users[0];

        return c.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                nodeId: user.node_id,
                fullName: user.full_name,
                isActive: user.is_active,
            },
        });
    } catch (error: any) {
        console.error('[Users] Update error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * DELETE /api/users/:id
 * Soft delete a user (SU only)
 */
export async function deleteUser(c: Context, sql: Sql) {
    try {
        const userId = parseInt(c.req.param('id'));

        await sql`
            UPDATE users
            SET is_active = false
            WHERE id = ${userId}
        `;

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Users] Delete error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
