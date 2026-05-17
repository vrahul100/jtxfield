import { Context } from 'hono';
import { Sql } from 'postgres';
import { User } from '../services/auth.js';
import { getRequestBody } from '../utils/request.js';

export async function submitIntegrationInterest(c: Context, sql: Sql) {
    try {
        const user: User = c.get('user');
        const { integrationName } = await getRequestBody(c);

        if (!integrationName) {
            return c.json({ error: 'Integration name is required' }, 400);
        }

        const [interest] = await sql`
            INSERT INTO integration_interest (node_id, integration_name, status)
            VALUES (${user.nodeId}, ${integrationName}, 'PENDING')
            RETURNING *
        `;

        return c.json({ interest });
    } catch (error: any) {
        console.error('[Integrations] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
}
