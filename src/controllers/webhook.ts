import { Context } from 'hono'
import { Sql } from 'postgres'
import { randomUUID } from 'crypto'
import { getQueue } from '../queue/index.js'
import { getMediaValidator } from '../validators/MediaValidator.js'
import { transcribeAudio } from '../services/transcribe.js'
import { copyTwilioMedia } from '../services/mediaStorage.js'
import { normalizeTwilioPayload } from '../utils/normalize.js'

const queue = getQueue();
const validator = getMediaValidator();

interface TwilioMedia {
  url: string;
  contentType: string;
}

/**
 * Handle incoming Twilio webhook.
 * Works for both SMS and WhatsApp messages.
 * Does quick validation, copies media to S3, transcribes audio, then queues for async processing.
 */
export const handleTwilioWebhook = async (c: Context, sql: Sql) => {
  let body: any
  const contentType = c.req.header('Content-Type') || ''

  if (contentType.includes('application/json')) {
    body = await c.req.json()
  } else {
    body = await c.req.parseBody()
  }

  // 1. NORMALIZE THE MESSAGE (works for SMS and WhatsApp)
  const normalized = normalizeTwilioPayload(body);
  console.log(`[WEBHOOK] ${normalized.source.toUpperCase()} from ${normalized.sender}`);

  // 2. QUICK VALIDATION (fast response to Twilio)
  const quickCheck = validator.quickValidate(body);
  if (!quickCheck.valid) {
    console.log(`❌ Quick validation failed: ${quickCheck.error}`)
    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  }

  // 3. COLLECT ALL MEDIA (images and audio separately)
  const twilioImages: TwilioMedia[] = [];
  const twilioAudio: TwilioMedia[] = [];

  for (const media of normalized.media) {
    if (media.contentType.startsWith('audio/')) {
      twilioAudio.push(media);
    } else if (media.contentType.startsWith('image/')) {
      twilioImages.push(media);
    }
  }

  // 4. AUTHENTICATE USER
  const members = await sql`SELECT * FROM members WHERE phone_number = ${normalized.sender}`
  if (members.length === 0) {
    console.log("❌ Unknown Member")
    // Return empty TwiML to avoid Twilio retry
    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  }
  const member = members[0]
  console.log(`[MEMBER AUTHENTICATED] ${member.full_name}`)

  // 5. GENERATE MESSAGE ID (needed for S3 paths)
  const messageId = randomUUID();

  // 6. COPY MEDIA TO S3 (Twilio URLs expire)
  console.log(`📦 Copying ${twilioImages.length} images and ${twilioAudio.length} audio files to S3...`);
  const mediaResult = await copyTwilioMedia(twilioImages, twilioAudio, messageId);

  // 7. TRANSCRIBE AUDIO (if present)
  let textBody = normalized.text;
  if (mediaResult.audioUrl) {
    console.log(`🎤 Transcribing audio...`);
    const transcript = await transcribeAudio(mediaResult.audioUrl, 'audio/mpeg');
    if (transcript) {
      textBody = `${textBody}\n[VOICE TRANSCRIPT]: ${transcript}`.trim();
    }
  }

  // 8. ENQUEUE FOR ASYNC PROCESSING
  const domain = member.domain || 'construction'  // Default to construction

  try {
    await queue.enqueue({
      userId: member.id,
      companyId: member.company_id,
      domain,
      source: normalized.source,
      fromPhone: normalized.sender,
      textBody,
      imageUrl: mediaResult.imageUrl,
      audioUrl: mediaResult.audioUrl,
    })

    console.log(`📥 Queued message ${messageId} [${normalized.source}] for ${domain} processing`)

    // 9. RETURN TWIML RESPONSE
    // Use <Message> tag to send immediate acknowledgment
    return c.text('<Response><Message>📥 Got it! Processing your request...</Message></Response>', 200, { 'Content-Type': 'text/xml' });
  } catch (error) {
    console.error('❌ Failed to queue message:', error)
    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  }
}
