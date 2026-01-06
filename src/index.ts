import { serve } from '@hono/node-server'
import { handle } from '@hono/node-server/vercel'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { createApp } from './app.js'
import { QueueWorker } from './workers/QueueWorker.js'
import { isLocalDevelopment } from './queue/index.js'

dotenv.config()

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.NODE_ENV === 'production' || process.env.DEPLOY_MODE === 'remote' ? 'require' : false,
})
const app = createApp(sql)

// Start background queue worker for local development
if (isLocalDevelopment()) {
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