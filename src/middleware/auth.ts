import { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Sql } from 'postgres';
import { User, getUserById } from '../services/auth.js';

// Session store (in-memory for MVP)
// In production, use Redis or database
interface Session {
    userId: number;
    expiresAt: number;
}

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a new session for a user in the database
 */
export async function createSession(sql: Sql, userId: number): Promise<string> {
    const expiresAt = Date.now() + SESSION_DURATION;

    const [session] = await sql`
        INSERT INTO sessions (user_id, expires_at)
        VALUES (${userId}, ${expiresAt})
        RETURNING id
    `;

    return session.id;
}

/**
 * Get session by ID from the database
 */
export async function getSession(sql: Sql, sessionId: string): Promise<Session | null> {
    const sessions = await sql`
        SELECT id, user_id as "userId", expires_at as "expiresAt"
        FROM sessions
        WHERE id = ${sessionId}
    `;

    if (sessions.length === 0) {
        return null;
    }

    const session = sessions[0] as Session;

    // Check if expired
    if (Date.now() > session.expiresAt) {
        await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
        return null;
    }

    return session;
}

/**
 * Delete a session from the database
 */
export async function deleteSession(sql: Sql, sessionId: string): Promise<void> {
    await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
}

/**
 * Clean up expired sessions in the database
 */
export async function cleanupExpiredSessions(sql: Sql): Promise<void> {
    const now = Date.now();
    await sql`DELETE FROM sessions WHERE expires_at < ${now}`;
}

/**
 * Middleware to require authentication
 * Adds user to context if authenticated
 */
export function requireAuth(sql: Sql) {
    return async (c: Context, next: Next) => {
        const sessionId = getCookie(c, 'sessionId');

        if (!sessionId) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const session = await getSession(sql, sessionId);
        if (!session) {
            return c.json({ error: 'Session expired' }, 401);
        }

        // Get user from database
        const user = await getUserById(sql, session.userId);
        if (!user) {
            await deleteSession(sql, sessionId);
            deleteCookie(c, 'sessionId');
            return c.json({ error: 'User not found' }, 401);
        }

        // Add user to context
        c.set('user', user);

        await next();
    };
}

/**
 * Middleware to require Super User role
 */
export function requireSU(sql: Sql) {
    return async (c: Context, next: Next) => {
        const sessionId = getCookie(c, 'sessionId');

        if (!sessionId) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const session = await getSession(sql, sessionId);
        if (!session) {
            return c.json({ error: 'Session expired' }, 401);
        }

        const user = await getUserById(sql, session.userId);
        if (!user) {
            await deleteSession(sql, sessionId);
            deleteCookie(c, 'sessionId');
            return c.json({ error: 'User not found' }, 401);
        }

        if (user.role !== 'SU') {
            return c.json({ error: 'Forbidden: Super User access required' }, 403);
        }

        c.set('user', user);
        await next();
    };
}

/**
 * Middleware to require Office Manager or Super User role
 */
export function requireOM(sql: Sql) {
    return async (c: Context, next: Next) => {
        const sessionId = getCookie(c, 'sessionId');

        if (!sessionId) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const session = await getSession(sql, sessionId);
        if (!session) {
            return c.json({ error: 'Session expired' }, 401);
        }

        const user = await getUserById(sql, session.userId);
        if (!user) {
            await deleteSession(sql, sessionId);
            deleteCookie(c, 'sessionId');
            return c.json({ error: 'User not found' }, 401);
        }

        if (user.role !== 'OM' && user.role !== 'SU') {
            return c.json({ error: 'Forbidden: Office Manager access required' }, 403);
        }

        c.set('user', user);
        await next();
    };
}

/**
 * Helper to set session cookie
 */
export function setSessionCookie(c: Context, sessionId: string): void {
    setCookie(c, 'sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: SESSION_DURATION / 1000, // seconds
        path: '/',
    });
}

/**
 * Helper to clear session cookie
 */
export function clearSessionCookie(c: Context): void {
    deleteCookie(c, 'sessionId');
}
