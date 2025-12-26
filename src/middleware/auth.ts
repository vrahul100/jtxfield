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

const sessions = new Map<string, Session>();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
    return crypto.randomUUID();
}

/**
 * Create a new session for a user
 */
export function createSession(userId: number): string {
    const sessionId = generateSessionId();
    const expiresAt = Date.now() + SESSION_DURATION;

    sessions.set(sessionId, { userId, expiresAt });

    // Clean up expired sessions (prevent memory leak)
    cleanupExpiredSessions();

    return sessionId;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): Session | null {
    const session = sessions.get(sessionId);

    if (!session) {
        return null;
    }

    // Check if expired
    if (Date.now() > session.expiresAt) {
        sessions.delete(sessionId);
        return null;
    }

    return session;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(sessionId);
        }
    }
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

        const session = getSession(sessionId);
        if (!session) {
            return c.json({ error: 'Session expired' }, 401);
        }

        // Get user from database
        const user = await getUserById(sql, session.userId);
        if (!user) {
            deleteSession(sessionId);
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
        // First check if authenticated
        const authMiddleware = requireAuth(sql);
        await authMiddleware(c, async () => {
            const user: User = c.get('user');

            if (user.role !== 'SU') {
                return c.json({ error: 'Forbidden: Super User access required' }, 403);
            }

            await next();
        });
    };
}

/**
 * Middleware to require Office Manager or Super User role
 */
export function requireOM(sql: Sql) {
    return async (c: Context, next: Next) => {
        // First check if authenticated
        const authMiddleware = requireAuth(sql);
        await authMiddleware(c, async () => {
            const user: User = c.get('user');

            if (user.role !== 'OM' && user.role !== 'SU') {
                return c.json({ error: 'Forbidden: Office Manager access required' }, 403);
            }

            await next();
        });
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
