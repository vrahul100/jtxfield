# AWS Lambda Production Notes

## Session Management

**Current (Development):**
- In-memory session store using Map
- Works fine for local development
- Not suitable for production Lambda

**Production Migration Required:**
- Sessions must be stored in DynamoDB or ElastiCache (Redis)
- Each Lambda invocation is stateless - can't rely on in-memory state
- Options:
  1. **DynamoDB Sessions** (serverless, auto-scaling)
     - Create `sessions` table with TTL
     - Use `sessionId` as partition key
     - Enable TTL on `expiresAt` field
  2. **ElastiCache Redis** (faster, requires VPC)
     - Use Redis for session storage
     - Requires Lambda in VPC with security group access

## Implementation Steps for Production

### 1. Create DynamoDB session table:
```typescript
// src/services/sessionStore.ts
const dynamodb = new DynamoDB.DocumentClient();

export async function saveSession(sessionId: string, userId: number, expiresAt: number) {
    await dynamodb.put({
        TableName: 'Sessions',
        Item: { sessionId, userId, expiresAt }
    }).promise();
}

export async function getSession(sessionId: string) {
    const result = await dynamodb.get({
        TableName: 'Sessions',
        Key: { sessionId }
    }).promise();
    return result.Item;
}
```

### 2. Update middleware/auth.ts:
- Replace `sessions.set()` → `saveSession()`
- Replace `sessions.get()` → `getSession()`
- No other code changes needed!

## Current Architecture (Already Lambda-Compatible)

✅ **Stateless request handling** - Each request is independent  
✅ **Database connection via postgres** - Works in Lambda  
✅ **No file system writes** - All data in DB  
✅ **Environment variables** - Lambda-friendly  
✅ **Hono framework** - Works with Lambda adapter  

## Deployment Notes

Use `@hono/aws-lambda` adapter:
```typescript
// src/lambda.ts
import { handle } from '@hono/aws-lambda'
import { createApp } from './app.js'

const sql = postgres(process.env.DATABASE_URL!)
const app = createApp(sql)

export const handler = handle(app)
```

**Lambda Configuration:**
- Runtime: Node.js 20.x
- Timeout: 30 seconds (for AI processing)
- Memory: 512 MB (adjust based on usage)
- Environment: DATABASE_URL, GROQ_API_KEY, TWILIO_*
