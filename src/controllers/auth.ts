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
        console.log(`[Auth] Login request. Headers:`, c.req.header());
        console.log(`[Auth] Content-Length: ${c.req.header('content-length')}`);
        console.log(`[Auth] BodyUsed: ${c.req.raw.bodyUsed}`);

        // Deep inspection of Environment and Request
        console.log(`[Auth] c.env keys: ${Object.keys(c.env)}`);

        // Check if body is pre-parsed in raw request (common in Vercel)
        // Check if body is pre-parsed in raw request (common in Vercel)
        let body;
        const incoming = (c.env as any).incoming;

        // Vercel (by default) parses the body and attaches it to the Node request.
        if (incoming && incoming.body && typeof incoming.body === 'object') {
            console.log('[Auth] Found pre-parsed body in c.env.incoming');
            body = incoming.body;
        } else {
            console.log('[Auth] No pre-parsed body. Parsing stream...');
            // Race condition to detect hang
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('JSON Read Timeout')), 4000));
            const parsePromise = c.req.json();
            body = await Promise.race([parsePromise, timeout]) as any;
        }

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
