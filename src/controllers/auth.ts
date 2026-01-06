import { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { Sql } from 'postgres';
import { authenticateUser } from '../services/auth.js';
import { createSession, deleteSession, setSessionCookie, clearSessionCookie, getSession } from '../middleware/auth.js';
import { getUserById } from '../services/auth.js';

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
export async function login(c: Context, sql: Sql) {
    try {
        const body = await c.req.json();
        const { email, password } = body;

        if (!email || !password) {
            return c.json({ error: 'Email and password are required' }, 400);
        }

        // Authenticate user
        const user = await authenticateUser(sql, email, password);

        if (!user) {
            return c.json({ error: 'Invalid email or password' }, 401);
        }

        // Create session
        const sessionId = await createSession(sql, user.id);

        // Set cookie
        setSessionCookie(c, sessionId);

        // Return user (without password hash)
        return c.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                nodeId: user.nodeId,
                fullName: user.fullName,
            },
        });
    } catch (error: any) {
        console.error('[Auth] Login error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * POST /api/auth/logout
 * Delete session and clear cookie
 */
export async function logout(c: Context, sql: Sql) {
    try {
        const sessionId = getCookie(c, 'sessionId');

        if (sessionId) {
            await deleteSession(sql, sessionId);
        }

        clearSessionCookie(c);

        return c.json({ success: true });
    } catch (error: any) {
        console.error('[Auth] Logout error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}

/**
 * GET /api/auth/session
 * Check if user is authenticated and return current user
 */
export async function checkSession(c: Context, sql: Sql) {
    try {
        const sessionId = getCookie(c, 'sessionId');

        if (!sessionId) {
            return c.json({ error: 'Not authenticated' }, 401);
        }

        const session = await getSession(sql, sessionId);
        if (!session) {
            clearSessionCookie(c);
            return c.json({ error: 'Session expired' }, 401);
        }

        // Get user
        const user = await getUserById(sql, session.userId);
        if (!user) {
            await deleteSession(sql, sessionId);
            clearSessionCookie(c);
            return c.json({ error: 'User not found' }, 401);
        }

        // Return user (without password hash)
        return c.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                nodeId: user.nodeId,
                fullName: user.fullName,
            },
        });
    } catch (error: any) {
        console.error('[Auth] Session check error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
