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
  Member,
  Bucket
} from '../services/bucketService.js'
import { sendTwilioMessage } from '../services/twilio.js'

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

  // 1. NORMALIZE THE MESSAGE
  const normalized = normalizeTwilioPayload(body);
  console.log(`[WEBHOOK] ${normalized.source.toUpperCase()} from ${normalized.sender}`);

  // 2. QUICK VALIDATION
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

  // 6. GET LAST CONFIRMED PROJECT
  const lastProject = await getLastConfirmedProject(sql, member);
  const projectId = lastProject?.id || null;
  console.log(`[PROJECT] ${lastProject ? lastProject.name : 'None (will ask)'}`);

  // 6. PROCESS MEDIA
  const { imageUrls, audioUrls, transcripts, messageSid } = await processMedia(normalized, body);

  // Combine text with transcripts
  let fullText = normalized.text;
  if (transcripts.length > 0) {
    fullText = `${fullText}\n[VOICE]: ${transcripts.join(' ')}`.trim();
  }

  // 7. FIND OR CREATE BUCKET
  let bucket = await findOpenBucket(sql, member.id, projectId);

  if (bucket) {
    // Append to existing bucket
    bucket = await appendToBucket(sql, bucket, {
      rawText: fullText,
      imageUrls,
      audioUrls,
      transcripts,
      messageSid,
    });
    console.log(`[BUCKET] Appended to #${bucket.id}`);
  } else {
    // Create new bucket
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
    });
    console.log(`[BUCKET] Created #${bucket.id}`);
  }

  // 8. VALIDATE BUCKET COMPLETENESS
  const validation = await validateBucket(sql, bucket);
  console.log(`[VALIDATE] Complete: ${validation.isComplete}, Errors: ${validation.errors.length}`);

  if (validation.isComplete) {
    // Close bucket and send confirmation
    await closeBucket(sql, bucket.id);

    // Update last confirmed project if we had one
    if (projectId) {
      await updateLastConfirmedProject(sql, member.id, projectId);
    }

    // Queue for processing
    await queueBucketForProcessing(bucket);

    // Send confirmation with project correction option
    const projectName = lastProject?.name || 'your current project';
    const confirmationMsg = lastProject
      ? `📥 Got it! Logged to: ${projectName}\n\nType N within 5 min if wrong project.`
      : `📥 Got it! Processing your message...`;

    return c.text(`<Response><Message>${confirmationMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  } else {
    // Bucket incomplete - keep open, maybe send acknowledgment
    return c.text('<Response><Message>📥 Received! Send more details or media if needed.</Message></Response>', 200, { 'Content-Type': 'text/xml' });
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
