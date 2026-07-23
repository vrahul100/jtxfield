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
  findProjectByAlias,
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

function isValidTwilioSignature(c: Context, body: any): boolean {
  if (process.env.DISABLE_TWILIO_VALIDATION === 'true' || process.env.SKIP_TWILIO_VALIDATION === 'true') {
    console.warn('⚠️ Twilio signature validation explicitly disabled via env variable');
    return true;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = c.req.header('X-Twilio-Signature');

  if (!authToken) {
    console.warn('⚠️ Skipping Twilio validation: TWILIO_AUTH_TOKEN is missing in env');
    return true;
  }

  if (!signature) {
    console.warn('⚠️ Skipping Twilio validation: X-Twilio-Signature header is missing');
    return true;
  }

  const candidateUrls: string[] = [];

  // 1. PUBLIC_URL if configured
  if (process.env.PUBLIC_URL) {
    let pUrl = process.env.PUBLIC_URL.trim();
    if (!pUrl.startsWith('http://') && !pUrl.startsWith('https://')) {
      pUrl = `https://${pUrl}`;
    }
    pUrl = pUrl.replace(/\/+$/, '');
    candidateUrls.push(`${pUrl}/twhook`);
    candidateUrls.push(`${pUrl}${c.req.path}`);
  }

  // 2. x-forwarded-host (Vercel reverse proxy header)
  const xForwardedHost = c.req.header('x-forwarded-host');
  if (xForwardedHost) {
    const cleanHost = xForwardedHost.split(',')[0].trim();
    candidateUrls.push(`https://${cleanHost}/twhook`);
    candidateUrls.push(`https://${cleanHost}${c.req.path}`);
    candidateUrls.push(`http://${cleanHost}/twhook`);
  }

  // 3. host header
  const host = c.req.header('host');
  if (host) {
    const cleanHost = host.split(',')[0].trim();
    candidateUrls.push(`https://${cleanHost}/twhook`);
    candidateUrls.push(`https://${cleanHost}${c.req.path}`);
    candidateUrls.push(`http://${cleanHost}/twhook`);
  }

  // 4. Raw request URL
  if (c.req.url) {
    candidateUrls.push(c.req.url);
    if (c.req.url.startsWith('http:')) {
      candidateUrls.push(c.req.url.replace('http:', 'https:'));
    }
  }

  const uniqueUrls = Array.from(new Set(candidateUrls));

  for (const testUrl of uniqueUrls) {
    try {
      const isValid = twilio.validateRequest(authToken, signature, testUrl, body);
      if (isValid) {
        return true;
      }
    } catch (err) {
      // Ignore individual validation attempt error
    }
  }

  console.error(`❌ Invalid Twilio Signature. Tried ${uniqueUrls.length} candidate URLs:`, uniqueUrls);
  console.error(`Headers received: host="${host}", x-forwarded-host="${xForwardedHost}", x-forwarded-proto="${c.req.header('x-forwarded-proto')}"`);
  return false;
}

export const handleTwilioWebhook = async (c: Context, sql: Sql) => {
  // VERCEL ADAPTER FIX: Use helper to handle pre-parsed body
  const body = await getRequestBody(c);

  // SECURITY: Validate Twilio Signature in production
  if (process.env.NODE_ENV === 'production') {
    const isValid = isValidTwilioSignature(c, body);
    if (!isValid) {
      return c.text('Forbidden', 403);
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

  // 3c. CHECK FOR TOTAL KEYWORDS
  if (messageText === 'TOTAL' || messageText === 'TOTAL HOY') {
    const lang = getLang(member);
    const isToday = messageText === 'TOTAL HOY';
    const timeFilter = isToday
      ? sql`created_at >= CURRENT_DATE`
      : sql`created_at >= date_trunc('week', CURRENT_DATE)`;

    const rows = await sql`SELECT SUM(time) as total FROM txns WHERE user_id = ${member.id} AND ${timeFilter}`;
    const hours = parseFloat(rows[0]?.total || '0').toFixed(1).replace(/\.0$/, '');

    const tWeek = isToday ? (lang === 'es' ? 'hoy' : 'today') : (lang === 'es' ? 'esta semana' : 'this week');
    const msg = lang === 'es'
        ? `⏱️ Has registrado *${hours} horas* ${tWeek}.`
        : `⏱️ You have logged *${hours} hours* ${tWeek}.`;
    
    return c.text(`<Response><Message>${msg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  }

  // 4. LOAD PENDING CORRECTION (confirmed by text OR voice, just below)
  const rawPending = (member as any).pending_correction;
  const pendingCorrection = rawPending
    ? (typeof rawPending === 'string' ? JSON.parse(rawPending) : rawPending)
    : null;

  // 5. EXTRACT MEDIA URLS (Worker will copy to storage async)
  const { imageUrls, audioUrls, messageSid } = extractMediaUrls(normalized, body);
  const hasMedia = imageUrls.length > 0 || audioUrls.length > 0;

  // 5a. Transcribe a standalone voice note up front so it can be interpreted at the webhook
  //     level — a spoken confirmation of a pending correction ("yes"/"no"), or a spoken
  //     command ("change ticket 11 to 10 hours"). Skipped for a mid-conversation answer
  //     (open bucket, no pending correction) — the engine transcribes those. The transcript
  //     is reused on the new bucket below, so we never transcribe twice.
  let voiceTranscript = '';
  if (audioUrls.length > 0 && !normalized.text.trim()) {
    let shouldTranscribe = !!pendingCorrection;
    if (!shouldTranscribe) {
      const inboxId = await ensureInboxProject(sql, member.company_id);
      shouldTranscribe = !(await findOpenBucket(sql, member.id, inboxId));
    }
    if (shouldTranscribe) {
      voiceTranscript = await transcribeAudio(audioUrls[0], 'audio/ogg', twilioAuthHeader(audioUrls[0]));
      console.log(`[WEBHOOK] Standalone voice transcript: "${voiceTranscript}"`);
    }
  }

  // Text used for command/confirmation detection: typed text, else the voice transcript.
  // Spoken numbers normalized to digits ("ten hours" → "10 hours").
  const commandFromVoice = !normalized.text.trim() && !!voiceTranscript;
  const intentText = wordsToDigits((normalized.text.trim() || voiceTranscript || '').trim());

  // 4b. PENDING CORRECTION CONFIRMATION — the LLM reads the reply's meaning (text or voice),
  //     so "yes", "sí", "yeah do it", "no leave it" all work without keyword lists.
  if (pendingCorrection) {
    const yn = await interpretYesNo(intentText);
    if (yn === 'yes') {
      console.log(`[WEBHOOK] Applying pending correction for member ${member.id}:`, JSON.stringify(pendingCorrection));
      const resultMsg = await applyCorrection(sql, pendingCorrection, member.id);
      await sql`UPDATE members SET pending_correction = NULL WHERE id = ${member.id}`;
      return c.text(`<Response><Message>${resultMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }
    if (yn === 'no') {
      await sql`UPDATE members SET pending_correction = NULL WHERE id = ${member.id}`;
      return c.text(`<Response><Message>↩️ Correction cancelled. Ticket #${pendingCorrection.bucket_id} unchanged.</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }
    // Anything else → abandon the pending correction and let the message flow normally.
    await sql`UPDATE members SET pending_correction = NULL WHERE id = ${member.id}`;
  }

  // NOTE: All conversation confirmation/selection is handled by the Edge Function engine,
  // which transcribes voice notes itself — so a spoken "yes"/"no" at the work-confirmation
  // step is already multimodal.

  // 6b. PRE-CHECK: Skip bucket creation for non-work text-only messages (greetings, etc.)
  // Only applies when: no media attached AND no existing open bucket (not mid-conversation)
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

  // 6c. CHECK FOR TICKET CORRECTION — typed "#122 city hall" OR spoken "change ticket 11 to 10 hours"
  const ticketId = matchTicketReference(intentText);
  if (ticketId !== null) {
    console.log(`[WEBHOOK] Detected ticket reference #${ticketId} (fromVoice=${commandFromVoice})`);

    // Verify bucket exists and belongs to this member
    const buckets = await sql`
      SELECT id, member_id, project_id, status FROM buckets 
      WHERE id = ${ticketId} 
        AND created_at > NOW() - INTERVAL '30 days'
      LIMIT 1
    `;

    if (buckets.length === 0) {
      return c.text(`<Response><Message>❌ Ticket #${ticketId} not found.</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }

    if (buckets[0].member_id !== member.id) {
      return c.text(`<Response><Message>❌ Ticket #${ticketId} doesn't belong to you.</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }

    // 6. EXTRACT MEDIA URLS FOR EVIDENCE ATTACHMENT
    const { imageUrls: newImages, audioUrls: newAudios } = extractMediaUrls(normalized, body);
    // Attached media is evidence ONLY when it isn't itself the spoken command. A voice note
    // that says "change ticket 11 to 10 hours" is a command to parse, not evidence to attach.
    const attachAsEvidence = (newImages.length > 0 || newAudios.length > 0) && !commandFromVoice;

    let correction;
    if (attachAsEvidence) {
      correction = {
        action: 'add_evidence' as const,
        value: JSON.stringify({ imageUrls: newImages, audioUrls: newAudios }),
      };
    } else {
      correction = await parseCorrectionIntent(intentText);
    }
    console.log(`[WEBHOOK] Correction intent:`, JSON.stringify(correction));

    if (correction.action === 'unknown' || !correction.value) {
      return c.text(`<Response><Message>❓ What would you like to change on Ticket #${ticketId}?\n\nExamples:\n• #${ticketId} City Mall\n• #${ticketId} 6 hours</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }

    // Build the pending correction
    const pendingData: any = {
      bucket_id: ticketId,
      action: correction.action,
      value: correction.value,
      created_at: new Date().toISOString(),
    };

    let confirmMsg = '';

    if (correction.action === 'add_evidence') {
      confirmMsg = `📝 Ticket #${ticketId}: Add the attached photo/media as evidence to this ticket?\n\nReply *Y* to confirm or *N* to cancel.`;
    } else if (correction.action === 'change_project') {
      // Try to resolve project name to ID
      const project = await findProjectByAlias(sql, member.company_id, correction.value);
      if (project) {
        pendingData.resolved_project_id = project.id;
        confirmMsg = `📝 Ticket #${ticketId}: Change project to *${project.name}*?\n\nReply *Y* to confirm or *N* to cancel.`;
      } else {
        // List available projects so user can pick
        const projects = await sql`
          SELECT name FROM projects 
          WHERE node_id = ${member.company_id} AND is_active = true AND is_inbox = false
          ORDER BY name
        `;
        const projectList = projects.map((p: any, i: number) => `${i + 1}. ${p.name}`).join('\n');
        return c.text(`<Response><Message>❓ Couldn't find project "${correction.value}".\n\nAvailable projects:\n${projectList}\n\nTry again: #${ticketId} [project name]</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
      }
    } else if (correction.action === 'change_hours') {
      const hours = parseFloat(correction.value);
      if (isNaN(hours) || hours <= 0 || hours > 24) {
        return c.text(`<Response><Message>❌ Invalid hours: ${correction.value}. Please use a number between 1-24.</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
      }
      confirmMsg = `📝 Ticket #${ticketId}: Change hours to *${hours}*?\n\nReply *Y* to confirm or *N* to cancel.`;
    }

    // Store pending correction on member
    await sql`UPDATE members SET pending_correction = ${JSON.stringify(pendingData)} WHERE id = ${member.id}`;
    console.log(`[WEBHOOK] Stored pending correction for member ${member.id}:`, JSON.stringify(pendingData));

    return c.text(`<Response><Message>${confirmMsg}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
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
        // Reuse the transcript we already computed for command detection (avoids a 2nd Whisper call)
        transcripts: voiceTranscript ? [voiceTranscript] : [],
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

// ============================================================================
// Ticket Correction Helpers
// ============================================================================

// Basic-auth header for fetching a raw Twilio media URL (needed before the copy worker runs).
function twilioAuthHeader(url: string): Record<string, string> {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (sid && token && url.includes('twilio.com')) {
    return { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') };
  }
  return {};
}

// Convert spoken number words (0–99) to digits so transcripts like "ticket eleven" /
// "ten hours" parse the same as "ticket 11" / "10 hours".
const NUM_ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const NUM_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
function wordsToDigits(text: string): string {
  return text
    // "twenty two" → 22 (tens optionally followed by ones)
    .replace(
      /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](one|two|three|four|five|six|seven|eight|nine))?\b/gi,
      (_m, tens: string, ones?: string) => String(NUM_TENS[tens.toLowerCase()] + (ones ? NUM_ONES[ones.toLowerCase()] : 0)),
    )
    // standalone ones / teens
    .replace(
      /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi,
      (_m, w: string) => String(NUM_ONES[w.toLowerCase()]),
    );
}

// Detect a ticket reference: "#11", "ticket 11", "ticket #11", "ticket number 11", or a
// "#11" that appears alongside an update keyword. Returns the ticket id or null.
function matchTicketReference(text: string): number | null {
  const t = text.trim();
  const hashStart = t.match(/^#(\d+)/);
  if (hashStart) return parseInt(hashStart[1], 10);
  const ticketWord = t.match(/\bticket\s*#?\s*(?:number|no\.?|num)?\s*(\d+)/i);
  if (ticketWord) return parseInt(ticketWord[1], 10);
  const hasUpdateKeyword = /update|change|correct|fix|modify|photo|image|audio|evidence|add/i.test(t);
  const hashAny = t.match(/#(\d+)/);
  if (hashAny && hasUpdateKeyword) return parseInt(hashAny[1], 10);
  return null;
}

// Interpret a reply to a Yes/No confirmation by MEANING — any phrasing or language, no
// keyword lists. Works identically for typed text and voice transcripts. Cost: one small
// call on the cheapest model, and only on the (rare) correction-confirmation turn.
async function interpretYesNo(text: string): Promise<'yes' | 'no' | 'unclear'> {
  const t = (text || '').trim();
  if (!t) return 'unclear';
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return 'unclear';
  try {
    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: groqApiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{
        role: 'user',
        content: `A worker was asked to confirm a change (Yes/No). They replied: "${t}"\nIs this an affirmation, a rejection, or unclear? Answer with exactly one word: yes, no, or unclear.`,
      }],
      temperature: 0,
      max_tokens: 3,
    });
    const out = (completion.choices?.[0]?.message?.content || '').toLowerCase();
    if (out.includes('yes')) return 'yes';
    if (out.includes('no')) return 'no';
    return 'unclear';
  } catch (error) {
    console.error('[Correction] interpretYesNo error:', error);
    return 'unclear';
  }
}

interface CorrectionIntent {
  action: 'change_project' | 'change_hours' | 'unknown';
  value: string | null;  // e.g. "City Mall" or "6"
}

/**
 * Parse what correction the user wants using LLM
 * e.g. "#122 city hall" → { action: 'change_project', value: 'city hall' }
 */
async function parseCorrectionIntent(text: string): Promise<CorrectionIntent> {
  // Strip the ticket reference and leading command verbs to leave just the change, e.g.
  // "change ticket 11 to 10 hours" → "to 10 hours"; "#11 city hall" → "city hall".
  const correctionText = text
    .replace(/#\d+/gi, ' ')
    .replace(/\bticket\s*#?\s*(?:number|no\.?|num)?\s*\d+/gi, ' ')
    .replace(/^\s*(?:please\s+)?(?:can you\s+)?(?:change|update|correct|fix|modify|set|make)\b/i, ' ')
    .replace(/^\s*(?:it\s+)?to\b/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!correctionText) {
    return { action: 'unknown', value: null };
  }

  // Try simple heuristics first
  const hoursMatch = correctionText.match(/(\d+\.?\d*)\s*(hours?|hrs?|h|horas?)/i);
  if (hoursMatch) {
    return { action: 'change_hours', value: hoursMatch[1] };
  }

  // Heuristic: If correctionText is just a valid integer/decimal number, assume it's hours
  const isNumber = /^\d+\.?\d*$/.test(correctionText);
  if (isNumber) {
    return { action: 'change_hours', value: correctionText };
  }

  // Use LLM for more nuanced interpretation
  const Groq = (await import('groq-sdk')).default;
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    // Fallback: assume project change (most common correction)
    return { action: 'change_project', value: correctionText };
  }

  try {
    const groq = new Groq({ apiKey: groqApiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: `A construction worker sent a correction for an existing work ticket. They wrote: "${correctionText}"

What do they want to change? Respond with ONLY valid JSON:
{
  "action": "change_project" or "change_hours",
  "value": "the new value they want"
}

- If they mention a location/place/project name → change_project, value = the project name
- If they mention hours/time → change_hours, value = the number
- Default to change_project if unclear` }],
      temperature: 0.1,
      max_tokens: 100,
    });

    const responseText = completion.choices?.[0]?.message?.content || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        action: parsed.action || 'change_project',
        value: parsed.value || correctionText,
      };
    }
  } catch (error) {
    console.error('[Correction] LLM parse error:', error);
  }

  // Fallback: assume project change
  return { action: 'change_project', value: correctionText };
}

/**
 * Apply a confirmed correction to a bucket and its linked transaction
 */
async function applyCorrection(
  sql: Sql,
  correction: { bucket_id: number; action: string; value: string; resolved_project_id?: number },
  memberId: number
): Promise<string> {
  const bucketId = correction.bucket_id;
  console.log(`[Correction] Applying: action=${correction.action}, value=${correction.value}, projectId=${correction.resolved_project_id}, bucket=${bucketId}`);

  if (correction.action === 'change_project') {
    if (!correction.resolved_project_id) {
      console.error(`[Correction] ❌ No resolved_project_id for change_project on bucket #${bucketId}`);
      return `❌ Could not apply correction: project "${correction.value}" was not resolved to a valid project. Try again with #${bucketId} [project name].`;
    }

    // Get project name for confirmation message
    const projects = await sql`SELECT name FROM projects WHERE id = ${correction.resolved_project_id}`;
    if (projects.length === 0) {
      return `❌ Project ID ${correction.resolved_project_id} no longer exists.`;
    }
    const projectName = projects[0].name;

    // Update bucket
    await sql`
      UPDATE buckets SET project_id = ${correction.resolved_project_id}, updated_at = NOW()
      WHERE id = ${bucketId}
    `;

    // Update linked transaction if exists
    const txnResult = await sql`
      UPDATE txns SET project_id = ${correction.resolved_project_id}
      WHERE bucket_id = ${bucketId}
    `;

    console.log(`[Correction] ✅ Bucket #${bucketId} project → ${projectName} (ID: ${correction.resolved_project_id}), txns updated: ${txnResult.count}`);
    return `✅ Ticket #${bucketId} updated! Project changed to *${projectName}*.`;

  } else if (correction.action === 'change_hours') {
    const hours = parseFloat(correction.value);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      return `❌ Invalid hours value: "${correction.value}". Please use a number between 1-24.`;
    }

    // Update bucket extracted_data and hours
    const buckets = await sql`SELECT extracted_data FROM buckets WHERE id = ${bucketId}`;
    let extractedData = {};
    if (buckets[0]?.extracted_data) {
      extractedData = typeof buckets[0].extracted_data === 'string'
        ? JSON.parse(buckets[0].extracted_data)
        : buckets[0].extracted_data;
    }
    (extractedData as any).hoursWorked = hours;

    await sql`
      UPDATE buckets SET 
        extracted_data = ${JSON.stringify(extractedData)}, 
        hours = ${hours},
        updated_at = NOW()
      WHERE id = ${bucketId}
    `;

    // Update linked transaction
    await sql`
      UPDATE txns SET time = ${hours}
      WHERE bucket_id = ${bucketId}
    `;

    console.log(`[Correction] ✅ Bucket #${bucketId} hours → ${hours}`);
    return `✅ Ticket #${bucketId} updated! Hours changed to *${hours}*.`;
  } else if (correction.action === 'add_evidence') {
    const { imageUrls: newImages, audioUrls: newAudios } = JSON.parse(correction.value);

    // 1. Update bucket media
    const buckets = await sql`SELECT image_urls, audio_urls FROM buckets WHERE id = ${bucketId}`;
    if (buckets.length > 0) {
      const bucket = buckets[0];
      const existingImages = bucket.image_urls ? (typeof bucket.image_urls === 'string' ? JSON.parse(bucket.image_urls) : bucket.image_urls) : [];
      const existingAudios = bucket.audio_urls ? (typeof bucket.audio_urls === 'string' ? JSON.parse(bucket.audio_urls) : bucket.audio_urls) : [];

      const mergedImages = Array.from(new Set([...existingImages, ...newImages]));
      const mergedAudios = Array.from(new Set([...existingAudios, ...newAudios]));

      await sql`
        UPDATE buckets SET 
          image_urls = ${JSON.stringify(mergedImages)}, 
          audio_urls = ${JSON.stringify(mergedAudios)},
          updated_at = NOW()
        WHERE id = ${bucketId}
      `;
    }

    // 2. Update linked transaction evidence list
    const txns = await sql`SELECT evidence FROM txns WHERE bucket_id = ${bucketId}`;
    if (txns.length > 0) {
      const txn = txns[0];
      const existingEvidence = txn.evidence ? (typeof txn.evidence === 'string' ? JSON.parse(txn.evidence) : txn.evidence) : [];
      const mergedEvidence = Array.from(new Set([...existingEvidence, ...newImages, ...newAudios]));

      await sql`
        UPDATE txns SET evidence = ${JSON.stringify(mergedEvidence)}
        WHERE bucket_id = ${bucketId}
      `;
    }

    console.log(`[Correction] ✅ Added evidence to bucket #${bucketId}`);
    return `✅ Ticket #${bucketId} updated! New photo/media added as evidence.`;
  }

  console.error(`[Correction] ❌ Unsupported action: "${correction.action}" for bucket #${bucketId}`);
  return `❌ Could not apply correction: unsupported action "${correction.action}". Supported: change project, change hours, add evidence.`;
}
