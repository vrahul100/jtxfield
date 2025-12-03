import { Hono } from 'hono'
import { Sql } from 'postgres'
import { handleTwilioWebhook } from './controllers/webhook.js'

export const createApp = (sql: Sql) => {
    const app = new Hono()

    // 1. TWILIO WEBHOOK
    app.post('/twilio-webhook', (c) => handleTwilioWebhook(c, sql))

    return app
}
