# Force New Bucket Feature

## Purpose
The `ForceNewBucket` parameter allows you to force the creation of a new bucket/ticket instead of appending to an existing open bucket.

## Usage

### In Twilio Webhook
When sending a WhatsApp message via Twilio, add:
```
ForceNewBucket=true
```
or
```
ForceNewBucket=1
```

### In Test Suite
The test suites automatically set `ForceNewBucket=true` for all test cases to ensure isolation.

### Manual Testing via cURL
```bash
curl -X POST http://localhost:3000/twhook \
  -d "From=whatsapp:+15102198037" \
  -d "Body=Did some work" \
  -d "ForceNewBucket=true" \
  -d "NumMedia=0"
```

## Use Cases

### 1. Testing
- Ensures each test case creates its own bucket
- Prevents test interference
- Makes cleanup deterministic

### 2. "I'm done with this ticket"
Users can indicate they want to start a new ticket:
```
User: "Actually I'm done with that, starting new work"
System: [Detects intent, sets ForceNewBucket internally]
System: "✅ Ticket #123 closed. Starting new ticket #124"
```

### 3. Manual Testing
Developers can test new buckets without waiting for the 10-minute window to expire.

## How It Works

```typescript
// In webhook controller
const forceNewBucket = body.ForceNewBucket === 'true' || body.ForceNewBucket === '1';

// Skip finding open bucket if flag is set
let bucket = forceNewBucket ? null : await findOpenBucket(sql, member.id, inboxProjectId);
```

When `forceNewBucket` is true:
- Skips `findOpenBucket()`
- Always creates new bucket
- Logs `[FORCE NEW]` in console

## Console Output

**Without flag:**
```
[INTENT] ADD_CONTENT (confidence: 1)
```

**With flag:**
```
[INTENT] ADD_CONTENT (confidence: 1) [FORCE NEW]
```
