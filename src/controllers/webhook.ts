import { Context } from 'hono'
import { Sql } from 'postgres'
import { randomUUID } from 'crypto'
import { getMediaValidator } from '../validators/MediaValidator.js'
import { transcribeAudio } from '../services/transcribe.js'
import { copyTwilioMedia } from '../services/mediaStorage.js'
import { normalizeTwilioPayload } from '../utils/normalize.js'
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

  // 7. FIND OR CREATE BUCKET (without project assignment yet)
  // Use Inbox as temporary placeholder - will be reassigned when validated
  const inboxProjectId = await ensureInboxProject(sql, member.company_id);

  let bucket = await findOpenBucket(sql, member.id, inboxProjectId);
  let isNewTicket = false;

  // Count total media in current message
  const newMediaCount = imageUrls.length + audioUrls.length;

  // 8. CLASSIFY INTENT using conversation history
  let conversationHistory: ConversationMessage[] = [];
  if (bucket) {
    conversationHistory = getConversationHistory(bucket);
  }

  const intent = await classifyIntent(conversationHistory, {
    text: fullText,
    hasMedia: newMediaCount > 0
  });
  console.log(`[INTENT] ${intent.intent} (confidence: ${intent.confidence})`);

  // 9. HANDLE INTENTS

  // CANCEL - User wants to abandon ticket
  if (intent.intent === 'CANCEL' && bucket) {
    await cancelBucket(sql, bucket.id);
    await appendConversation(sql, bucket.id, [
      { role: 'user', content: fullText, media: imageUrls, timestamp: new Date().toISOString() },
      { role: 'assistant', content: `🚫 Ticket #${bucket.id} cancelled.`, timestamp: new Date().toISOString() }
    ]);
    return c.text(`<Response><Message>🚫 Ticket #${bucket.id} cancelled. Send a new message when you're ready to log work.</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  }

  // CORRECTION - User wants to fix something
  if (intent.intent === 'CORRECTION' && bucket) {
    // Clear the pending validation question
    await sql`UPDATE buckets SET ai_response = NULL, updated_at = NOW() WHERE id = ${bucket.id}`;
    await appendConversation(sql, bucket.id, [
      { role: 'user', content: fullText, media: imageUrls, timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'No problem! Send the corrected info or photo.', timestamp: new Date().toISOString() }
    ]);
    return c.text(`<Response><Message>No problem! What would you like to correct? Send the updated info or photo.</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  }

  // CONFIRM - User is confirming/accepting (only if bucket exists)
  if (intent.intent === 'CONFIRM' && bucket) {
    const validation = await validateBucket(sql, bucket);

    if (validation.isComplete) {
      // Submit the ticket
      await submitBucket(sql, bucket.id, validation.errors.length > 0);
      await closeBucket(sql, bucket.id);

      // Infer project before closing
      const { extractMessageInfo } = await import('../services/extractionService.js');
      const extraction = await extractMessageInfo(
        bucket.raw_text || '',
        bucket.transcripts ? JSON.parse(bucket.transcripts) : [],
        bucket.image_urls ? JSON.parse(bucket.image_urls) : [],
        member.domain || 'construction'
      );

      let projectName = 'Inbox';
      if (extraction.projectName) {
        const matchedProject = await findProjectByAlias(sql, member.company_id, extraction.projectName);
        if (matchedProject) {
          projectName = matchedProject.name;
          await sql`UPDATE buckets SET project_id = ${matchedProject.id} WHERE id = ${bucket.id}`;
        }
      }

      const confirmMsg = `✅ Ticket #${bucket.id} submitted for ${projectName}! Thanks for your report.`;
      await appendConversation(sql, bucket.id, [
        { role: 'user', content: fullText, timestamp: new Date().toISOString() },
        { role: 'assistant', content: confirmMsg, timestamp: new Date().toISOString() }
      ]);
      return c.text(`<Response><Message>${confirmMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    } else {
      // Ticket not complete - ask for missing info
      const question = validation.questions[0] || 'Please add more details.';
      await sql`UPDATE buckets SET ai_response = ${question}, updated_at = NOW() WHERE id = ${bucket.id}`;
      await appendConversation(sql, bucket.id, [
        { role: 'user', content: fullText, timestamp: new Date().toISOString() },
        { role: 'assistant', content: question, timestamp: new Date().toISOString() }
      ]);
      return c.text(`<Response><Message>Got it, but we still need: ${question}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }
  }

  // ADD_CONTENT - Adding work details (or new ticket)
  if (bucket) {
    // Check existing media count (max 5)
    const existingImages = bucket.image_urls ? JSON.parse(bucket.image_urls) : [];
    const existingAudio = bucket.audio_urls ? JSON.parse(bucket.audio_urls) : [];
    const existingMediaCount = existingImages.length + existingAudio.length;
    const totalAfterAppend = existingMediaCount + newMediaCount;

    if (totalAfterAppend > 5) {
      console.log(`[TICKET] Ticket #${bucket.id} at media limit`);
      const limitMsg = `⚠️ Ticket #${bucket.id} has max 5 attachments. Send text details or wait for this ticket to close.`;
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
    // Create new bucket (in Inbox temporarily)
    bucket = await createBucket(sql, {
      memberId: member.id,
      nodeId: member.company_id,
      projectId: inboxProjectId,
      source: normalized.source,
      fromPhone: normalized.sender,
      rawText: fullText,
      imageUrls,
      audioUrls,
      transcripts,
      messageSid,
      suspectedProjectName: null,
    });
    isNewTicket = true;
    console.log(`[TICKET] Opened ticket #${bucket.id}`);
  }

  // 10. VALIDATE TICKET COMPLETENESS
  const validation = await validateBucket(sql, bucket);
  console.log(`[VALIDATE] Complete: ${validation.isComplete}, Errors: ${validation.errors.length}`);

  // Count attempts (number of messages added to this ticket)
  const messageSids = bucket.message_sids ? JSON.parse(bucket.message_sids) : [];
  const attemptCount = messageSids.length;
  console.log(`[TICKET] Attempt count: ${attemptCount}`);

  if (validation.isComplete) {
    // 9. NOW INFER PROJECT (only when ticket is complete)
    const { extractMessageInfo } = await import('../services/extractionService.js');
    const extraction = await extractMessageInfo(
      bucket.raw_text || '',
      bucket.transcripts ? JSON.parse(bucket.transcripts) : [],
      bucket.image_urls ? JSON.parse(bucket.image_urls) : [],
      member.domain || 'construction'
    );

    console.log(`[AI EXTRACTION] Project: "${extraction.projectName}", Clear: ${extraction.isProjectClear}`);

    let finalProjectId: number | null = null;
    let projectName = '';

    // Try to match project by alias
    if (extraction.projectName) {
      const matchedProject = await findProjectByAlias(sql, member.company_id, extraction.projectName);
      if (matchedProject) {
        finalProjectId = matchedProject.id;
        projectName = matchedProject.name;
        console.log(`[PROJECT] Alias match: "${extraction.projectName}" → ${matchedProject.name}`);
      }
    }

    // Fallback to last confirmed project
    if (!finalProjectId) {
      const lastProject = await getLastConfirmedProject(sql, member);
      if (lastProject) {
        finalProjectId = lastProject.id;
        projectName = lastProject.name;
        console.log(`[PROJECT] Using last confirmed: ${lastProject.name}`);
      }
    }

    // If STILL no project, ASK user which project
    if (!finalProjectId) {
      // Get list of projects to offer
      const projects = await sql`
        SELECT id, name FROM projects 
        WHERE node_id = ${member.company_id} AND is_inbox = false AND is_active = true
        ORDER BY name LIMIT 5
      `;

      if (projects.length > 0) {
        // Store pending project selection state (using validation_attempts as flag)
        await sql`
          UPDATE buckets 
          SET validation_attempts = -1, updated_at = NOW()
          WHERE id = ${bucket.id}
        `;

        const projectList = projects.map((p: any, i: number) => `${i + 1}. ${p.name}`).join('\n');
        const askProjectMsg = `📋 Ticket #${bucket.id} is ready!\n\nWhich project is this for?\n\n${projectList}\n\nReply with the number.`;
        return c.text(`<Response><Message>${askProjectMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
      } else {
        // No projects to choose from, go to Inbox
        finalProjectId = inboxProjectId;
        projectName = 'Inbox';
      }
    }

    // Update bucket with final project and submit
    await sql`
      UPDATE buckets 
      SET project_id = ${finalProjectId}, status = 'submitted', updated_at = NOW()
      WHERE id = ${bucket.id}
    `;

    // Update last confirmed if not Inbox
    if (finalProjectId !== inboxProjectId) {
      await updateLastConfirmedProject(sql, member.id, finalProjectId!);
    }

    const lang = getLang(member);
    const summaryLine = validation.summary ? `"${validation.summary}"\n\n` : '';
    const confirmationMsg = `${t(lang, 'ticket_submitted', { id: bucket.id })}\n\n${summaryLine}${t(lang, 'logged_to', { project: projectName })}`;
    return c.text(`<Response><Message>${confirmationMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });

  } else if (attemptCount >= 5) {
    // After 5 attempts, send for review
    await sql`
      UPDATE buckets 
      SET status = 'pending_review', updated_at = NOW() 
      WHERE id = ${bucket.id}
    `;
    console.log(`[TICKET] Sent ticket #${bucket.id} for review after ${attemptCount} attempts`);

    const lang = getLang(member);
    const reasonLine = validation.questions.length > 0
      ? `\n\nReason: ${validation.questions[0].replace('⚠️ ', '').replace('The details don\'t look right. ', '')}`
      : '';
    const reviewMsg = `${t(lang, 'ticket_review', { id: bucket.id })}${reasonLine}\n\n${t(lang, 'admin_followup')}`;

    // Store conversation
    await appendConversation(sql, bucket.id, [
      { role: 'user', content: fullText, media: imageUrls, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reviewMsg, timestamp: new Date().toISOString() }
    ]);

    return c.text(`<Response><Message>${reviewMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });

  } else {
    // Ticket incomplete - ask clarifying questions
    const lang = getLang(member);
    if (validation.questions.length > 0) {
      const questionText = validation.questions.join('\n\n');

      // Store the question in ai_response so we can include it as context in the next message
      await sql`
        UPDATE buckets 
        SET ai_response = ${questionText}, updated_at = NOW()
        WHERE id = ${bucket.id}
      `;

      const questionMsg = isNewTicket
        ? `${t(lang, 'ticket_opened', { id: bucket.id })}\n\n${questionText}`
        : `Ticket #${bucket.id}: ${questionText}`;

      // Store conversation
      await appendConversation(sql, bucket.id, [
        { role: 'user', content: fullText, media: imageUrls, timestamp: new Date().toISOString() },
        { role: 'assistant', content: questionMsg, timestamp: new Date().toISOString() }
      ]);

      return c.text(`<Response><Message>${questionMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    } else if (isNewTicket) {
      const openMsg = `${t(lang, 'ticket_opened', { id: bucket.id })}\n\n${t(lang, 'send_photos')}`;

      await appendConversation(sql, bucket.id, [
        { role: 'user', content: fullText, media: imageUrls, timestamp: new Date().toISOString() },
        { role: 'assistant', content: openMsg, timestamp: new Date().toISOString() }
      ]);

      return c.text(`<Response><Message>${openMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    } else {
      const responseMsg = `${t(lang, 'ticket_received', { id: bucket.id })} ${t(lang, 'send_details')}`;

      await appendConversation(sql, bucket.id, [
        { role: 'user', content: fullText, media: imageUrls, timestamp: new Date().toISOString() },
        { role: 'assistant', content: responseMsg, timestamp: new Date().toISOString() }
      ]);

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
