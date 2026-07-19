import { serve } from '@hono/node-server'
import { handle } from '@hono/node-server/vercel'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { createApp } from './app.js'
import { QueueWorker } from './workers/QueueWorker.js'
import { isLocalDevelopment } from './queue/index.js'

dotenv.config()

// Determine if we are on Vercel
const isVercel = process.env.VERCEL === '1';

// Log environment for debugging
console.log(`[Server] Starting up. Env: ${process.env.NODE_ENV}, Vercel: ${isVercel}`);

const dbUrl = process.env.DATABASE_URL!;
const isLocalDb = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

const sql = postgres(dbUrl, {
  // Force SSL on Vercel, or if production/remote, unless we are connecting to a local DB
  ssl: !isLocalDb && (isVercel || process.env.NODE_ENV === 'production' || process.env.DEPLOY_MODE === 'remote') ? 'require' : false,
  prepare: false, // Disable prepared statements for Supabase Transaction Pooler (port 6543)
  idle_timeout: 1, // Close idle connections quickly in serverless
  max: 1 // Max 1 connection per lambda to avoid exhausting pool
})
const app = createApp(sql)

// Start background queue worker for local development
// NEVER start this on Vercel, even if NODE_ENV is not production (e.g. preview)
if (isLocalDevelopment() && !process.env.VERCEL) {
  console.log('[Server] Starting local queue worker...')
  const worker = new QueueWorker(sql, 500)  // Poll every 500ms
  worker.start()
}

if (process.env.NODE_ENV !== 'production') {
  console.log(`Server is running on port ${process.env.PORT || 3000}`)
  serve({
    fetch: app.fetch,
    port: Number(process.env.PORT || 3000)
  })
}

export default handle(app)