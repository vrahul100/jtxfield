import { Context } from 'hono'
import { Sql } from 'postgres'
import { parseChangeOrder } from '../services/ai.js'

export const handleTwilioWebhook = async (c: Context, sql: Sql) => {
  let body: any
  const contentType = c.req.header('Content-Type') || ''

  if (contentType.includes('application/json')) {
    body = await c.req.json()
  } else {
    body = await c.req.parseBody()
  }
  const fromPhone = body['From'] as string
  const textBody = body['Body'] as string
  const imageUrl = body['MediaUrl0'] as string | null

  console.log(`[WEBHOOK] Method: ${c.req.method} | URL: ${c.req.url}`)
  console.log('[WEBHOOK] Full Body:', JSON.stringify(body, null, 2))
  console.log(`[SMS RECEIVED] From: ${fromPhone} | Body: ${textBody}`)

  if (!fromPhone || !textBody) {
    console.log("❌ Missing From or Body")
    return c.text('Missing From or Body', 400)
  }

  // A. AUTHENTICATE
  const users = await sql`SELECT * FROM users WHERE phone_number = ${fromPhone}`
  if (users.length === 0) {
    console.log("❌ Unknown User")
    return c.text('User not recognized.')
  }
  const user = users[0]

  console.log(`[USER AUTHENTICATED] ${user.full_name}`)
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
}
