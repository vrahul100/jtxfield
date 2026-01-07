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
  getLastConfirmedProject,
  findOpenBucket,
  createBucket,
  appendToBucket,
  validateBucket,
  closeBucket,
  addToHoldingTank,
  updateLastConfirmedProject,
  queueBucketForProcessing,
  ensureInboxProject,
  findProjectByAlias,
  Member,
  Bucket
} from '../services/bucketService.js'
import { sendTwilioMessage } from '../services/twilio.js'
import { handleJoinRequest } from './joinHandler.js'
import { confirmMemberByPhone } from './members.js'
import {
  classifyIntent,
  getConversationHistory,
  appendConversation,
  generateResponse,
  cancelBucket,
  submitBucket,
  ConversationMessage
} from '../services/conversationEngine.js'

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
      const welcomeMsg = `✅ Welcome to Jentyx JField${name}!${teamMsg}

You're now activated. Start sending your work updates via text, photos, or voice notes.`;
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

  // 4. CHECK FOR PROJECT SELECTION RESPONSE (numbered reply to correction)
  const trimmedText = normalized.text.trim();
  if (/^\d+$/.test(trimmedText)) {
    const result = await handleProjectSelectionResponse(c, sql, member, parseInt(trimmedText, 10), normalized);
    if (result) return result;
  }

  // 5. CHECK FOR PROJECT CORRECTION REQUEST ("N")
  if (trimmedText.toUpperCase() === 'N') {
    return handleProjectCorrection(c, sql, member, normalized);
  }

  // 6. EXTRACT MEDIA URLS (Worker will copy to storage async)
  const { imageUrls, audioUrls, messageSid } = extractMediaUrls(normalized, body);

  // 7. FIND OR CREATE BUCKET
  const inboxProjectId = await ensureInboxProject(sql, member.company_id);
  const forceNewBucket = body.ForceNewBucket === 'true' || body.ForceNewBucket === '1';
  let bucket = forceNewBucket ? null : await findOpenBucket(sql, member.id, inboxProjectId);

  if (bucket) {
    bucket = await appendToBucket(sql, bucket, {
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

  // 8. MARK BUCKET FOR ASYNC PROCESSING (Postgres trigger will fire)
  await sql`
    UPDATE buckets 
    SET status = 'pending_processing', updated_at = NOW()
    WHERE id = ${bucket.id}
  `;

  console.log(`[WEBHOOK] Bucket #${bucket.id} marked for processing`);

  // 9. TRIGGER EDGE FUNCTION VIA PG_NET (Async)
  // We do this to ensure it runs even if the DB trigger is missing/broken
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      const functionUrl = `${supabaseUrl}/functions/v1/process-bucket`;
      const payload = JSON.stringify({ bucketId: bucket.id });
      const headers = JSON.stringify({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      });

      // Use pg_net to make async HTTP call from within Postgres
      // This returns immediately and doesn't block the webhook
      await sql`
        SELECT net.http_post(
          url := ${functionUrl},
          body := ${payload}::jsonb,
          headers := ${headers}::jsonb
        )
      `;
      console.log(`[WEBHOOK] Triggered process-bucket via pg_net`);
    } else {
      console.warn('[WEBHOOK] Missing Supabase credentials for async trigger');
    }
  } catch (err) {
    console.error('[WEBHOOK] Failed to trigger async processing:', err);
    // Don't fail the request, just log it
  }

  // 10. SEND IMMEDIATE RECEIPT (So user isn't ghosted)
  // Only for new buckets or if we are appending to one that was just created
  try {
    const statusMsg = "🤖 Received! Processing your work...";
    // await sendTwilioMessage(normalized.sender, statusMsg, normalized.source as any);
  } catch (e) {
    console.error('[WEBHOOK] Failed to send receipt:', e);
  }

  // 11. RETURN IMMEDIATE ACKNOWLEDGMENT
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

/**
 * Handle project correction when user types "N"
 */
async function handleProjectCorrection(
  c: Context,
  sql: Sql,
  member: Member,
  normalized: any
): Promise<Response> {
  console.log(`[CORRECTION] User ${member.phone_number} wants to change project`);

  // Find the most recent bucket for this member
  const recentBuckets = await sql`
    SELECT * FROM buckets
    WHERE member_id = ${member.id}
      AND created_at > NOW() - INTERVAL '30 minutes'
      AND status IN ('closed', 'processing', 'completed')
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (recentBuckets.length === 0) {
    return c.text('<Response><Message>No recent activity to correct.</Message></Response>', 200, { 'Content-Type': 'text/xml' });
  }

  const bucketToFix = recentBuckets[0];

  // Mark this specific bucket as awaiting correction
  await sql`
    UPDATE buckets SET 
      status = 'awaiting_correction',
      updated_at = NOW()
    WHERE id = ${bucketToFix.id}
  `;
  console.log(`[CORRECTION] Marked bucket #${bucketToFix.id} as awaiting_correction`);

  // Get available projects
  const projects = await sql`
    SELECT id, name FROM projects 
    WHERE node_id = ${member.company_id} AND is_active = true
    ORDER BY name
    LIMIT 10
  `;

  if (projects.length === 0) {
    return c.text('<Response><Message>No projects found. Please contact your admin.</Message></Response>', 200, { 'Content-Type': 'text/xml' });
  }

  // Send project list
  const projectList = projects.map((p: any, i: number) => `${i + 1}. ${p.name}`).join('\n');
  const msg = `🔄 Which project should I fix this to?\n\n${projectList}\n\nReply with the number.`;

  await sendTwilioMessage(normalized.sender, msg, normalized.source);

  return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
}

/**
 * Handle numbered response for project selection (retroactive fix)
 */
async function handleProjectSelectionResponse(
  c: Context,
  sql: Sql,
  member: Member,
  selection: number,
  normalized: any
): Promise<Response | null> {
  // First check for open bucket awaiting project selection (validation_attempts = -1)
  const pendingProjectBuckets = await sql`
    SELECT b.* FROM buckets b
    WHERE b.member_id = ${member.id}
      AND b.status = 'open'
      AND b.validation_attempts = -1
    ORDER BY b.updated_at DESC
    LIMIT 1
  `;

  if (pendingProjectBuckets.length > 0) {
    const bucket = pendingProjectBuckets[0];

    // Get projects for selection (same query as when asking)
    const projects = await sql`
      SELECT id, name FROM projects 
      WHERE node_id = ${member.company_id} AND is_inbox = false AND is_active = true
      ORDER BY name LIMIT 5
    `;

    const projectIndex = selection - 1;
    if (projectIndex < 0 || projectIndex >= projects.length) {
      const msg = `Invalid selection. Reply with a number between 1 and ${projects.length}.`;
      return c.text(`<Response><Message>${msg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }

    const selectedProject = projects[projectIndex] as { id: number; name: string };
    console.log(`[PROJECT] User selected: ${selectedProject.name} for bucket #${bucket.id}`);

    // Update bucket with selected project and submit
    await sql`
      UPDATE buckets SET 
        project_id = ${selectedProject.id},
        status = 'submitted',
        validation_attempts = 0,
        updated_at = NOW()
      WHERE id = ${bucket.id}
    `;

    // Update last confirmed project
    await updateLastConfirmedProject(sql, member.id, selectedProject.id);

    const confirmationMsg = `✅ Ticket #${bucket.id} submitted!\n\nLogged to: ${selectedProject.name}`;
    return c.text(`<Response><Message>${confirmationMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  }

  // Otherwise check for awaiting_correction (legacy flow)
  const awaitingBuckets = await sql`
    SELECT b.*, p.name as project_name FROM buckets b
    LEFT JOIN projects p ON b.project_id = p.id
    WHERE b.member_id = ${member.id}
      AND b.status = 'awaiting_correction'
    ORDER BY b.updated_at DESC
    LIMIT 1
  `;

  if (awaitingBuckets.length === 0) {
    // No bucket awaiting correction - this is just a regular numbered message
    return null;
  }

  const bucketToFix = awaitingBuckets[0];
  console.log(`[CORRECTION] Found bucket #${bucketToFix.id} awaiting correction`);

  // Get projects for selection
  const projects = await sql`
    SELECT id, name FROM projects 
    WHERE node_id = ${member.company_id} AND is_active = true
    ORDER BY name
    LIMIT 10
  `;

  const projectIndex = selection - 1;
  if (projectIndex < 0 || projectIndex >= projects.length) {
    await sendTwilioMessage(
      normalized.sender,
      `Invalid selection. Please reply with a number between 1 and ${projects.length}.`,
      normalized.source
    );
    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  }

  const newProject = projects[projectIndex] as { id: number; name: string };
  console.log(`[CORRECTION] Fixing bucket #${bucketToFix.id} from "${bucketToFix.project_name}" to "${newProject.name}"`);

  // 1. Update the bucket (restore to submitted status)
  await sql`
    UPDATE buckets SET 
      project_id = ${newProject.id},
      status = 'submitted',
      updated_at = NOW()
    WHERE id = ${bucketToFix.id}
  `;

  // 2. Update any associated transaction
  await sql`
    UPDATE txns SET 
      project_id = ${newProject.id}
    WHERE bucket_id = ${bucketToFix.id}
  `;

  // 3. Update member's last confirmed project
  await sql`
    UPDATE members SET 
      last_confirmed_project_id = ${newProject.id},
      project_confirmed_at = NOW()
    WHERE id = ${member.id}
  `;

  // Send confirmation
  const confirmMsg = `✅ Fixed! Changed project to: ${newProject.name}`;
  await sendTwilioMessage(normalized.sender, confirmMsg, normalized.source);

  console.log(`[CORRECTION] ✅ Retroactively fixed bucket #${bucketToFix.id} and any txns`);

  return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
}
