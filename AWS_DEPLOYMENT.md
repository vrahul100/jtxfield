# jField - AWS Deployment Guide (Future)

> ⚠️ **This is for future reference.** The current MVP uses Supabase + Vercel. When you're ready to scale to AWS, use this guide.

## Architecture

The Hono app is designed to be platform-agnostic. The same `app.ts` can be deployed to:
- ✅ Local development (Node.js server)
- ✅ Vercel Serverless Functions
- ✅ AWS Lambda
- ✅ Cloudflare Workers
- ✅ Deno Deploy

## Creating AWS Lambda Entry Points

### 1. API Lambda (src/lambda.ts)

```typescript
import { handle } from '@hono/aws-lambda'
import postgres from 'postgres'
import { createApp } from './app.js'

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })
const app = createApp(sql)

export const handler = handle(app)
```

### 2. Worker Lambda (src/worker.ts)

For SQS-based background processing:

```typescript
import postgres from 'postgres'
import { SQSEvent, SQSHandler } from 'aws-lambda'
import { processBucketMessage } from './services/processingService.js'

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

export const handler: SQSHandler = async (event: SQSEvent) => {
    for (const record of event.Records) {
        const { bucketId, messageSid } = JSON.parse(record.body)
        await processBucketMessage(sql, bucketId, messageSid)
    }
}
```

## AWS Infrastructure

### Required Services
- **AWS Lambda** - API + Worker functions
- **Amazon RDS** (PostgreSQL) - Database
- **Amazon SQS** - Queue for async processing
- **Amazon S3** - Media storage
- **API Gateway** - HTTP endpoint

### Environment Variables
```
DATABASE_URL=postgres://user:pass@rds-endpoint:5432/db
AWS_REGION=us-east-1
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456/queue
S3_BUCKET=your-media-bucket
GROQ_API_KEY=gsk_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
```

## Migration from Supabase to AWS

1. **Database**: Export Supabase PostgreSQL → Import to RDS
2. **Storage**: Copy Supabase Storage → S3
3. **Edge Function**: Replace with SQS + Lambda worker
4. **Update `.env`**: Switch to AWS credentials
5. **Update `webhook.ts`**: Replace status update with SQS enqueue

## Why Keep Both Options?

| Platform | Pros | Cons |
|----------|------|------|
| **Supabase + Vercel** | Free tier, simple setup, low ops | Limited scale, vendor lock-in |
| **AWS** | Unlimited scale, full control | Higher cost, more ops work |

**Recommendation**: Start with Supabase/Vercel for MVP, migrate to AWS when you have paying customers and need to scale.
