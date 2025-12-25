import { Hono } from 'hono'
import { Sql } from 'postgres'
import { handleTwilioWebhook } from './controllers/webhook.js'
import { createAdminRoutes } from './controllers/admin.js'

export const createApp = (sql: Sql) => {
    const app = new Hono()

    // 1. TWILIO WEBHOOK
    app.post('/twhook', (c) => handleTwilioWebhook(c, sql))

    // 2. ADMIN API
    app.route('/admin', createAdminRoutes(sql))

    return app
}
