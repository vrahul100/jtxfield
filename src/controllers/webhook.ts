import { Context } from 'hono'
import { Sql } from 'postgres'
import twilio from 'twilio';
import { randomUUID } from 'crypto'
import { getMediaValidator } from '../validators/MediaValidator.js'
import { transcribeAudio } from '../services/transcribe.js'
import { copyTwilioMedia } from '../services/mediaStorage.js'
import { normalizeTwilioPayload } from '../utils/normalize.js'
import { getRequestBody } from '../utils/request.js';
import { t, getLang } from '../services/i18n.js'
import {
  findOpenBucket,
  createBucket,
  appendToBucket,
  addToHoldingTank,
  ensureInboxProject,
  Member,
  Bucket
} from '../services/bucketService.js'
import { handleJoinRequest } from './joinHandler.js'
import { confirmMemberByPhone } from './members.js'

const validator = getMediaValidator();

interface TwilioMedia {
  url: string;
  contentType: string;
}

/**
 * Handle incoming Twilio webhook.
 * 
 * FLOW:
 * 1. Validate & authenticate member
 * 2. Unknown users → holding tank
 * 3. Get last confirmed project (valid for 4 hrs)
 * 4. Find open bucket OR create new one
 * 5. Append message to bucket
 * 6. AI validate bucket completeness
 * 7. Close bucket if complete → send confirmation
 */
// ... existing imports ...

export const handleTwilioWebhook = async (c: Context, sql: Sql) => {
  // 0. SECURITY: Validate Twilio Signature
  // In production, we MUST validate that the request came from Twilio
  if (process.env.NODE_ENV === 'production' || process.env.validate_twilio === 'true') {
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioSignature = c.req.header('X-Twilio-Signature');
    const url = c.req.url; // This might need to be the full public URL

    // We need the raw body for validation
    // Hono's c.req.parseBody() or json() consumes the stream, so we might need to be careful.
    // However, validateRequest takes params object for POST requests.
    // Let's get the params first.

    // NOTE: validation logic can be tricky with proxies/Hono. 
    // For now, we will add the check but allow bypassing if token is missing (with a log).

    if (twilioAuthToken && twilioSignature) {
      let params: any = {};
      const contentType = c.req.header('Content-Type') || '';

      // Clone request is hard here. 
      // We will assume body parsing happens next and we validate AFTER parsing if possible, 
      // OR we trust the "body" variable if we move this down.
      // But the plan implies adding it. 
      // Let's rely on `body` variable being populated.
    }
  }

  // VERCEL ADAPTER FIX: Use helper to handle pre-parsed body
  const body = await getRequestBody(c);

  // REAL VALIDATION NOW that we have body
  if (process.env.NODE_ENV === 'production') {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const signature = c.req.header('X-Twilio-Signature');
    // For Hono on Vercel/Node, c.req.url might be relative or absolute.
    // We usually need the public URL (e.g. jtxfield.vercel.app/twhook).
    // Let's assume process.env.PUBLIC_URL is set or we construct it.
    const publicUrl = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/twhook` : c.req.url;

    if (authToken && signature) {
      const isValid = twilio.validateRequest(
        authToken,
        signature,
        publicUrl,
        body
      );

      if (!isValid) {
        // Fallback: Vercel might report http, but Twilio sees https. 
        // If validation fails on http, try forcing https.
        if (publicUrl.startsWith('http:')) {
          const secureUrl = publicUrl.replace('http:', 'https:');
          const isValidSecure = twilio.validateRequest(authToken, signature, secureUrl, body);
          if (!isValidSecure) {
            console.error('❌ Invalid Twilio Signature (both HTTP and HTTPS)');
            return c.text('Forbidden', 403);
          }
        } else {
          console.error('❌ Invalid Twilio Signature');
          return c.text('Forbidden', 403);
        }
      }
    } else {
      console.warn('⚠️ Skipping Twilio validation: Missing token or signature');
    }
  }

  // 1. NORMALIZE THE MESSAGE (works for SMS and WhatsApp)
  const normalized = normalizeTwilioPayload(body);
  console.log(`[WEBHOOK] ${normalized.source.toUpperCase()} from ${normalized.sender}`);

  // 2. CHECK FOR MEMBER CONFIRMATION (before authentication)
  const messageText = normalized.text.trim().toUpperCase();
  if (messageText === 'YES') {
    const confirmResult = await confirmMemberByPhone(sql, normalized.sender);
    if (confirmResult.success) {
      const name = confirmResult.member?.full_name ? `, ${confirmResult.member.full_name}` : '';
      const teamMsg = confirmResult.nodeName ? ` You've joined ${confirmResult.nodeName}.` : '';
      const welcomeMsg = `🎉 *Welcome to Jentyx${name}!${teamMsg}*\n\n*You're now activated and ready to go!*\n\nJust send:\n• 📸 Photos of your work\n• 🎤 Voice notes describing what you did\n• ⏱️ Details of your work like hours, materials used, etc.`;
      return c.text(`<Response><Message>${welcomeMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }
    // If not a pending member, continue with normal flow
  }

  // 3. CHECK FOR JOIN REQUEST (before authentication)
  if (messageText.toUpperCase() === 'JOIN JTX' || messageText.toUpperCase() === 'JOIN') {
    return await handleJoinRequest(c, sql, normalized, body);
  }

  // 3. QUICK VALIDATION (fast response to Twilio)
  const quickCheck = validator.quickValidate(body);
  if (!quickCheck.valid) {
    console.log(`❌ Quick validation failed: ${quickCheck.error}`)
    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  }

  // 3. AUTHENTICATE MEMBER
  const members = await sql`SELECT * FROM members WHERE phone_number = ${normalized.sender}`

  if (members.length === 0) {
    // Unknown user → holding tank
    console.log("❌ Unknown user → holding tank");
    await handleUnknownUser(sql, normalized, body);
    return c.text('<Response><Message>👋 Hi! You\'re not registered. Please contact your admin.</Message></Response>', 200, { 'Content-Type': 'text/xml' });
  }

  const member = members[0] as Member;
  console.log(`[MEMBER] ${member.full_name} (ID: ${member.id}, Co: ${member.company_id})`);

  // 3b. CHECK IF MEMBER IS ASSIGNED TO A COMPANY
  // "New User" from JOIN flow has null company_id until admin assigns them.
  if (!member.company_id) {
    console.log(`[MEMBER] Pending assignment (no company_id) -> holding tank`);
    await handleUnknownUser(sql, normalized, body);
    const pendingMsg = `⏳ You are registered but waiting for team assignment.
    
Your message has been saved. An admin will add you to your project soon!`;
    return c.text(`<Response><Message>${pendingMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  }

  // NOTE: All project confirmation/selection is handled by Edge Function's resolveProjectNode
  // No interception needed here - messages flow directly to bucket processing

  // 6. EXTRACT MEDIA URLS (Worker will copy to storage async)
  const { imageUrls, audioUrls, messageSid } = extractMediaUrls(normalized, body);

  // 6b. PRE-CHECK: Skip bucket creation for non-work text-only messages (greetings, etc.)
  // Only applies when: no media attached AND no existing open bucket (not mid-conversation)
  const hasMedia = imageUrls.length > 0 || audioUrls.length > 0;
  if (!hasMedia && normalized.text.trim()) {
    const inboxProjectId = await ensureInboxProject(sql, member.company_id);
    const existingBucket = await findOpenBucket(sql, member.id, inboxProjectId);

    if (!existingBucket) {
      // No open bucket — check if this is a non-work message before creating one
      const text = normalized.text.toLowerCase().trim();
      const nonWorkPatterns = [
        'hello', 'hi', 'hey', 'hola', 'buenos dias', 'buenas tardes', 'buenas noches',
        'good morning', 'good afternoon', 'good evening', 'good night',
        'thanks', 'thank you', 'gracias', 'ok', 'okay',
        'how are you', 'como estas', 'que tal', 'sup', 'whats up', "what's up",
        'bye', 'goodbye', 'adios', 'see you', 'later', 'nos vemos',
        'test', 'testing', 'prueba',
      ];
      const isNonWork = nonWorkPatterns.some(p => text === p || text === p + '!' || text === p + '?')
        || text.length < 4; // Very short messages like "hi", "yo"

      if (isNonWork) {
        console.log(`[WEBHOOK] Non-work message detected ("${normalized.text}"), skipping bucket creation`);
        // Detect language from the input text itself
        const esPatterns = ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'gracias', 'como estas', 'que tal', 'adios', 'nos vemos', 'prueba', 'ola'];
        const isSpanish = esPatterns.some(p => text === p || text.startsWith(p));
        const greeting = isSpanish
          ? '👋 ¡Hola! Envía fotos, notas de voz o texto describiendo tu trabajo para registrarlo.'
          : '👋 Hi! Send photos, voice notes, or text describing your work to log it.';
        return c.text(`<Response><Message>${greeting}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
      }
    }
    // If existingBucket exists, let it flow through — user is mid-conversation
  }

  // 7. USE TRANSACTION WITH ROW-LEVEL LOCK TO PREVENT RACE CONDITIONS
  // Lock the member row - this blocks concurrent requests for the same member
  // until this transaction completes
  console.log(`[WEBHOOK] Starting transaction with row lock for member ${member.id}`);
  
  let bucket: Bucket | undefined;
  await sql.begin(async (sql) => {
    // Lock the member row - second request will WAIT here until first completes
    await sql`SELECT * FROM members WHERE id = ${member.id} FOR UPDATE`;
    console.log(`[WEBHOOK] Acquired row lock for member ${member.id}`);

    // 8. FIND OR CREATE BUCKET (protected by row lock)
    const inboxProjectId = await ensureInboxProject(sql, member.company_id);
    const forceNewBucket = body.ForceNewBucket === 'true' || body.ForceNewBucket === '1';
    let foundBucket = forceNewBucket ? null : await findOpenBucket(sql, member.id, inboxProjectId);

    if (foundBucket) {
      bucket = await appendToBucket(sql, foundBucket, {
        rawText: normalized.text,
        imageUrls,
        audioUrls,
        transcripts: [],
        messageSid,
      });
    } else {
      bucket = await createBucket(sql, {
        memberId: member.id,
        nodeId: member.company_id,
        projectId: inboxProjectId,
        source: normalized.source,
        fromPhone: normalized.sender,
        rawText: normalized.text,
        imageUrls,
        audioUrls,
        transcripts: [],
        messageSid,
      });
    }
    
    console.log(`[WEBHOOK] Transaction complete, releasing row lock for member ${member.id}`);
  });

  if (!bucket) {
    console.error('[WEBHOOK] Failed to create or find bucket');
    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  }


  // 9. MARK BUCKET FOR ASYNC PROCESSING (triggers DB function)
  // Only update if bucket is NOT already completed/submitted
  await sql`
    UPDATE buckets 
    SET status = 'pending_processing', updated_at = NOW()
    WHERE id = ${bucket.id}
      AND status NOT IN ('submitted', 'flagged', 'pending_review')
  `;

  console.log(`[WEBHOOK] Bucket #${bucket.id} marked for processing`);

  // 10. EDGE FUNCTION IS TRIGGERED BY DATABASE TRIGGER
  // The process_bucket_trigger on the buckets table handles Edge Function invocation
  // This ensures single-source triggering and prevents duplicate processing
  console.log(`[WEBHOOK] DB trigger will handle Edge Function for bucket #${bucket.id}`);

  // 11. SEND IMMEDIATE RECEIPT (So user isn't ghosted)
  // Only for new buckets or if we are appending to one that was just created
  try {
    const statusMsg = "🤖 Received! Processing your work...";
    // await sendTwilioMessage(normalized.sender, statusMsg, normalized.source as any);
  } catch (e) {
    console.error('[WEBHOOK] Failed to send receipt:', e);
  }

  // 12. RETURN IMMEDIATE ACKNOWLEDGMENT
  return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
}

/**
 * Extract raw Twilio media URLs (no copy, worker handles that async)
 */
function extractMediaUrls(normalized: any, body: any): {
  imageUrls: string[];
  audioUrls: string[];
  messageSid: string | null;
} {
  const imageUrls: string[] = [];
  const audioUrls: string[] = [];

  for (const media of normalized.media) {
    if (media.contentType.startsWith('audio/')) {
      audioUrls.push(media.url);
    } else if (media.contentType.startsWith('image/')) {
      imageUrls.push(media.url);
    }
  }

  return {
    imageUrls,
    audioUrls,
    messageSid: body.MessageSid || null,
  };
}

/**
 * Handle unknown users - add to holding tank
 */
async function handleUnknownUser(sql: Sql, normalized: any, body: any): Promise<void> {
  const twilioImages: TwilioMedia[] = [];
  const twilioAudio: TwilioMedia[] = [];

  for (const media of normalized.media) {
    if (media.contentType.startsWith('audio/')) {
      twilioAudio.push(media);
    } else if (media.contentType.startsWith('image/')) {
      twilioImages.push(media);
    }
  }

  await addToHoldingTank(sql, {
    fromPhone: normalized.sender,
    source: normalized.source,
    rawText: normalized.text,
    imageUrls: twilioImages.map(m => m.url),
    audioUrls: twilioAudio.map(m => m.url),
    messageSid: body.MessageSid || null,
  });
}

/**
 * Process media: copy to S3 and transcribe audio
 */
async function processMedia(normalized: any, body: any): Promise<{
  imageUrls: string[];
  audioUrls: string[];
  transcripts: string[];
  messageSid: string | null;
}> {
  const twilioImages: TwilioMedia[] = [];
  const twilioAudio: TwilioMedia[] = [];

  for (const media of normalized.media) {
    if (media.contentType.startsWith('audio/')) {
      twilioAudio.push(media);
    } else if (media.contentType.startsWith('image/')) {
      twilioImages.push(media);
    }
  }

  const messageId = randomUUID();
  console.log(`📦 Processing ${twilioImages.length} images, ${twilioAudio.length} audio`);

  const mediaResult = await copyTwilioMedia(twilioImages, twilioAudio, messageId);

  // Transcribe audio
  const transcripts: string[] = [];
  if (mediaResult.audioUrl) {
    console.log(`🎤 Transcribing...`);
    const transcript = await transcribeAudio(mediaResult.audioUrl, 'audio/mpeg');
    if (transcript) {
      transcripts.push(transcript);
    }
  }

  return {
    imageUrls: mediaResult.imageUrl ? [mediaResult.imageUrl] : [],
    audioUrls: mediaResult.audioUrl ? [mediaResult.audioUrl] : [],
    transcripts,
    messageSid: body.MessageSid || null,
  };
}

// NOTE: Project correction/selection functions removed - Edge Function's resolveProjectNode handles all project flows
