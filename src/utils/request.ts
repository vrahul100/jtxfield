import { Context } from 'hono';

/**
 * Safely parse request body, handling Vercel's pre-parsed body behavior.
 * 
 * Vercel's Node.js runtime pre-parses request bodies and attaches them to
 * request['incoming']['body']. Hono's c.req.json() / c.req.parseBody()
 * attempts to read from the stream again, which causes a hang (timeout)
 * because the stream is already drained.
 */
export async function getRequestBody(c: Context): Promise<any> {
    // 1. Check for pre-parsed body (Vercel/Node adapter)
    try {
        const incoming = (c.env as any)?.incoming;
        if (incoming && incoming.body && typeof incoming.body === 'object') {
            // console.log('[Request] Using pre-parsed body from (c.env.incoming.body)');
            return incoming.body;
        }
    } catch (e) {
        // Ignore access errors
    }

    // 2. Fallback to standard parsing
    const contentType = c.req.header('Content-Type') || '';
    if (contentType.includes('application/json')) {
        return await c.req.json();
    } else {
        return await c.req.parseBody();
    }
}
