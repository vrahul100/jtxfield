```
npm install
npm run deploy
npm run dev

 npx drizzle-kit generate
 npx drizzle-kit migrate
 ngrok http 3000


 Verification
✅ Build: npm run build completed successfully
✅ TypeScript: All types compile without errors
✅ Dependencies: Added @aws-sdk/client-sqs, @types/aws-lambda

Usage
Local Development
npm run dev
# Server starts with background queue worker
Environment Variables
# Required
DATABASE_URL=postgres://...
GROQ_API_KEY=...
# For production SQS
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/...
AWS_REGION=us-east-1
NODE_ENV=production
Adding a New Domain Processor
Create src/processors/MyDomainProcessor.ts extending 
BaseProcessor
Implement 
getSystemPrompt()
 with domain-specific AI instructions
Register in 
ProcessorRegistry.ts
AWS Deployment Notes
For production, you'll need to:

Create an SQS FIFO queue (for message ordering)
Deploy the sqsHandler as a Lambda function
Configure SQS as Lambda trigger
Update the existing Lambda (esbuild bundle) to only handle the webhook


```
New files:

src/utils/normalize.ts - Normalizes Twilio payloads for both SMS and WhatsApp
Updated:

src/queue/types.ts - Added MessageSource, NormalizedMessage, and source field
src/controllers/webhook.ts - Uses normalizer + returns TwiML <Response></Response>
Queue implementations now include the source field
The webhook now handles both:

SMS: From: +15551234567
WhatsApp: From: whatsapp:+15551234567 → normalized to +15551234567
Run npm run dev to test.