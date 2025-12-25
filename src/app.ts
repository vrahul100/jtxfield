import { Hono } from 'hono'
import { Sql } from 'postgres'
import { handleTwilioWebhook } from './controllers/webhook.js'
import { createAdminRoutes } from './controllers/admin.js'
import { getInbox, bulkAssign, addAlias } from './controllers/inbox.js'

export const createApp = (sql: Sql) => {
    const app = new Hono()

    // 1. TWILIO WEBHOOK
    app.post('/twhook', (c) => handleTwilioWebhook(c, sql))

    // 2. ADMIN API
    app.route('/admin', createAdminRoutes(sql))

    // 3. INBOX API (Office Manager revenue recovery)
    app.get('/api/inbox/:nodeId', (c) => getInbox(c, sql))
    app.post('/api/inbox/bulk-assign', (c) => bulkAssign(c, sql))
    app.post('/api/inbox/add-alias', (c) => addAlias(c, sql))

    return app
}
