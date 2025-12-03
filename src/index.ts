import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import postgres from 'postgres'
import { parseChangeOrder } from './services/ai'
import dotenv from 'dotenv'

dotenv.config()

const app = new Hono()
const sql = postgres(process.env.DATABASE_URL!)

// 1. TWILIO WEBHOOK
app.post('/twilio-webhook', async (c) => {
  const body = await c.req.parseBody()
  const fromPhone = body['From'] as string
  const textBody = body['Body'] as string
  const imageUrl = body['MediaUrl0'] as string | null

  console.log(`[WEBHOOK] Method: ${c.req.method} | URL: ${c.req.url}`)
  console.log('[WEBHOOK] Full Body:', JSON.stringify(body, null, 2))
  console.log(`[SMS RECEIVED] From: ${fromPhone} | Body: ${textBody}`)

  // A. AUTHENTICATE
  const users = await sql`SELECT * FROM users WHERE phone_number = ${fromPhone}`
  if (users.length === 0) {
    console.log("❌ Unknown User")
    return c.text('User not recognized.')
  }
  const user = users[0]

  // B. PROCESS (In prod, we would queue this. Locally, we await it.)
  console.log("🤖 Asking Groq...")
  const aiResult = await parseChangeOrder(textBody, user.full_name, imageUrl || null)

  // C. CALCULATE REVENUE (Rate Card)
  const rates = await sql`SELECT default_hourly_rate FROM companies WHERE id = ${user.company_id}`
  const rate = parseFloat(rates[0].default_hourly_rate)
  const revenue = aiResult.hours * aiResult.workers.length * rate

  // D. SAVE TO DB
  const ticket = await sql`
    INSERT INTO change_orders (company_id, user_id, raw_text, scope_description, estimated_revenue, status)
    VALUES (${user.company_id}, ${user.id}, ${textBody}, ${aiResult.scope}, ${revenue}, 'PROCESSED')
    RETURNING id
  `

  console.log(`✅ Ticket #${ticket[0].id} Created | Revenue: $${revenue}`)

  // E. REPLY TO FOREMAN
  return c.text(`Ticket #${ticket[0].id} logged. Value: $${revenue}. Thanks ${user.full_name}!`)
})

console.log(`Server is running on port ${process.env.PORT || 3000}`)
serve({
  fetch: app.fetch,
  port: Number(process.env.PORT || 3000)
})