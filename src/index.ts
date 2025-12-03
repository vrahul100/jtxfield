import { serve } from '@hono/node-server'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { createApp } from './app.js'

dotenv.config()

const sql = postgres(process.env.DATABASE_URL!)
const app = createApp(sql)

console.log(`Server is running on port ${process.env.PORT || 3000}`)
serve({
  fetch: app.fetch,
  port: Number(process.env.PORT || 3000)
})