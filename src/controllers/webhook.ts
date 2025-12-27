import { Context } from 'hono'
import { Sql } from 'postgres'
import { randomUUID } from 'crypto'
import { getMediaValidator } from '../validators/MediaValidator.js'
import { transcribeAudio } from '../services/transcribe.js'
import { copyTwilioMedia } from '../services/mediaStorage.js'
import { normalizeTwilioPayload } from '../utils/normalize.js'
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

  // 2. CHECK FOR MEMBER CONFIRMATION (before authentication)
  const messageText = normalized.text.trim().toUpperCase();
  if (messageText === 'CONFIRM') {
    const confirmResult = await confirmMemberByPhone(sql, normalized.sender);
    if (confirmResult.success) {
      const name = confirmResult.member?.full_name ? `, ${confirmResult.member.full_name}` : '';
      const teamMsg = confirmResult.nodeName ? ` You've joined ${confirmResult.nodeName}.` : '';
      const welcomeMsg = `✅ Welcome to JTX Field${name}!${teamMsg}

You're now activated. Start sending your work updates via text, photos, or voice notes.`;
      return c.text(`<Response><Message>${welcomeMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }
    // If not a pending member, continue with normal flow
  }

  // 3. CHECK FOR JOIN REQUEST (before authentication)
  if (messageText === 'JOIN JTX' || messageText === 'JOIN') {
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
  console.log(`[MEMBER] ${member.full_name}`);

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

  // 6. PROCESS MEDIA
  const { imageUrls, audioUrls, transcripts, messageSid } = await processMedia(normalized, body);

  // Combine text with transcripts
  let fullText = normalized.text;
  if (transcripts.length > 0) {
    fullText = `${fullText}\n[VOICE]: ${transcripts.join(' ')}`.trim();
  }

  // 7. NEW INBOX FLOW: AI EXTRACTION → ALIAS MATCH → LAST CONFIRMED → INBOX FALLBACK
  const { extractMessageInfo } = await import('../services/extractionService.js');

  // Run AI extraction to get suspected project name
  const extraction = await extractMessageInfo(
    fullText,
    transcripts,
    imageUrls,
    member.domain || 'construction'
  );
  const suspectedProjectName = extraction.projectName;

  console.log(`[AI EXTRACTION] Suspected project: "${suspectedProjectName}", isProjectClear: ${extraction.isProjectClear}`);

  let projectId: number | null = null;
  let projectMatchInfo = '';

  // Try fuzzy match with project aliases
  if (suspectedProjectName) {
    const matchedProject = await findProjectByAlias(sql, member.company_id, suspectedProjectName);
    if (matchedProject) {
      projectId = matchedProject.id;
      projectMatchInfo = `[ALIAS MATCH] "${suspectedProjectName}" → Project:${matchedProject.name}`;
    }
  }

  // Fall back to last confirmed project if no alias match
  if (!projectId) {
    const lastProject = await getLastConfirmedProject(sql, member);
    if (lastProject) {
      projectId = lastProject.id;
      projectMatchInfo = `[LAST CONFIRMED] Project:${lastProject.name}`;
    }
  }

  // Final fallback: assign to Inbox
  let isInbox = false;
  if (!projectId) {
    projectId = await ensureInboxProject(sql, member.company_id);
    isInbox = true;
    projectMatchInfo = `[INBOX] Tag: "${suspectedProjectName || 'unknown'}"`;
  }

  console.log(`[PROJECT] ${projectMatchInfo}`);

  // 8. FIND OR CREATE BUCKET (ticket)
  let bucket = await findOpenBucket(sql, member.id, projectId);
  let isNewTicket = false;

  // Count total media in current message
  const newMediaCount = imageUrls.length + audioUrls.length;

  if (bucket) {
    // Check existing media count
    const existingImages = bucket.image_urls ? JSON.parse(bucket.image_urls) : [];
    const existingAudio = bucket.audio_urls ? JSON.parse(bucket.audio_urls) : [];
    const existingMediaCount = existingImages.length + existingAudio.length;
    const totalAfterAppend = existingMediaCount + newMediaCount;

    if (totalAfterAppend > 5) {
      // At media limit - don't append more media, just notify
      console.log(`[TICKET] Ticket #${bucket.id} at media limit (${existingMediaCount} existing, ${newMediaCount} new)`);
      const limitMsg = `⚠️ Ticket #${bucket.id} already has ${existingMediaCount} attachments (max 5). No more can be added.\n\nSend text details instead, or wait for this ticket to close.`;
      return c.text(`<Response><Message>${limitMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }

    // Append to existing bucket
    bucket = await appendToBucket(sql, bucket, {
      rawText: fullText,
      imageUrls,
      audioUrls,
      transcripts,
      messageSid,
    });
    console.log(`[TICKET] Appended to ticket #${bucket.id}`);
  } else {
    // Create new bucket (ticket)
    bucket = await createBucket(sql, {
      memberId: member.id,
      nodeId: member.company_id,
      projectId,
      source: normalized.source,
      fromPhone: normalized.sender,
      rawText: fullText,
      imageUrls,
      audioUrls,
      transcripts,
      messageSid,
      suspectedProjectName,
    });
    isNewTicket = true;
    console.log(`[TICKET] Opened ticket #${bucket.id}`);
  }

  // 9. VALIDATE TICKET COMPLETENESS
  const validation = await validateBucket(sql, bucket);
  console.log(`[VALIDATE] Complete: ${validation.isComplete}, Errors: ${validation.errors.length}`);

  // Count attempts (number of messages added to this ticket)
  const messageSids = bucket.message_sids ? JSON.parse(bucket.message_sids) : [];
  const attemptCount = messageSids.length;
  console.log(`[TICKET] Attempt count: ${attemptCount}`);

  if (validation.isComplete) {
    // Close ticket and send confirmation with ticket number
    await closeBucket(sql, bucket.id);

    // Update last confirmed project if we had one (and it's not Inbox)
    if (projectId && !isInbox) {
      await updateLastConfirmedProject(sql, member.id, projectId);
    }

    // Get project name for confirmation
    const projectResult = await sql`SELECT name, is_inbox FROM projects WHERE id = ${projectId}`;
    const projectName = projectResult[0]?.name || 'Inbox';

    // Build confirmation message with ticket number
    const summaryLine = validation.summary ? `"${validation.summary}"\n\n` : '';
    const tagLine = isInbox && suspectedProjectName
      ? `(Tag: ${suspectedProjectName}) `
      : '';
    const confirmationMsg = `✅ Ticket #${bucket.id} submitted!\n\n${summaryLine}${tagLine}Logged to: ${projectName}`;

    return c.text(`<Response><Message>${confirmationMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  } else if (attemptCount >= 2) {
    // After 2 attempts, send for review - include the reason if available
    await sql`
      UPDATE buckets 
      SET status = 'pending_review', updated_at = NOW() 
      WHERE id = ${bucket.id}
    `;
    console.log(`[TICKET] Sent ticket #${bucket.id} for review after ${attemptCount} attempts`);

    // Include validation errors/questions in review message
    const reasonLine = validation.questions.length > 0
      ? `\n\nReason: ${validation.questions[0].replace('⚠️ ', '').replace('The details don\'t look right. ', '')}`
      : (validation.errors.length > 0 ? `\n\nIssue: ${validation.errors[0]}` : '');

    const reviewMsg = `📋 Ticket #${bucket.id} sent for review.${reasonLine}\n\nAn admin will follow up.`;
    return c.text(`<Response><Message>${reviewMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  } else {
    // Ticket incomplete - show questions (including inconsistency) or generic message
    if (validation.questions.length > 0) {
      // Show validation questions (includes inconsistency reasons)
      const questionMsg = isNewTicket
        ? `📋 Ticket #${bucket.id} opened.\n\n${validation.questions.join('\n\n')}`
        : `Ticket #${bucket.id}: ${validation.questions.join('\n\n')}`;
      return c.text(`<Response><Message>${questionMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    } else if (isNewTicket) {
      const openMsg = `📋 Ticket #${bucket.id} opened.\n\nSend photos and details to complete it.`;
      return c.text(`<Response><Message>${openMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    } else {
      const responseMsg = `📥 Ticket #${bucket.id}: Received! Send more details to complete.`;
      return c.text(`<Response><Message>${responseMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }
  }
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
  // Find bucket explicitly marked as awaiting_correction for this member
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

  // 1. Update the bucket (restore to completed status)
  await sql`
    UPDATE buckets SET 
      project_id = ${newProject.id},
      status = 'completed',
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
