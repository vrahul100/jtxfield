import { Sql } from 'postgres';
import Groq from 'groq-sdk';
import { Bucket } from './bucketService.js';

// ============================================================================
// Types
// ============================================================================

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    media?: string[];
    timestamp: string;
}

export type Intent = 'ADD_CONTENT' | 'CONFIRM' | 'CORRECTION' | 'CANCEL';

export interface IntentResult {
    intent: Intent;
    confidence: number;
    extractedData: {
        hours?: number;
        projectHint?: string;
        workDescription?: string;
    };
}

// ============================================================================
// Intent Classification
// ============================================================================

// Lazy initialization of Groq client
let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
    if (!groqClient && process.env.GROQ_API_KEY) {
        groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groqClient;
}

/**
 * Classify the intent of an incoming message using conversation context
 */
export async function classifyIntent(
    conversationHistory: ConversationMessage[],
    currentMessage: { text: string; hasMedia: boolean }
): Promise<IntentResult> {
    const groq = getGroqClient();

    // If no Groq client (API key missing), use simple heuristics
    if (!groq) {
        console.warn('[ConversationEngine] GROQ_API_KEY not set, using heuristic classification');
        return classifyIntentHeuristic(currentMessage.text);
    }

    // Format conversation history for prompt (with null safety)
    const historyText = conversationHistory.length > 0
        ? conversationHistory
            .filter(m => m && m.role && m.content)
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n')
        : '(No previous messages)';

    const prompt = `You are analyzing a WhatsApp message from a construction worker submitting work reports.

CONVERSATION HISTORY:
${historyText}

CURRENT MESSAGE:
Text: "${currentMessage.text}"
Has attachments: ${currentMessage.hasMedia}

Classify the user's intent:
- ADD_CONTENT: Worker is providing work details, hours, descriptions, or media. Also if they're answering a question with specific information.
- CONFIRM: Worker is confirming/accepting ("ok", "yes", "correct", "looks good", "that's right", "si", "yeah", "yep", "fine")
- CORRECTION: Worker wants to fix something ("wrong photo", "actually", "let me redo", "that's not right", "no wait", "mistake")
- CANCEL: Worker wants to abandon this ticket ("cancel", "never mind", "forget it", "stop")

Also extract any data if ADD_CONTENT:
- hours: numeric hours worked (if mentioned, e.g. "4 hours" → 4, "worked 2.5 hrs" → 2.5)
- projectHint: any project name mentioned
- workDescription: brief description of what work was done

IMPORTANT: 
- Short affirmative responses like "ok", "yes", "si", "yeah", "fine", "good" should be CONFIRM
- If the message contains actual work information (hours, descriptions), it's ADD_CONTENT
- Only use CORRECTION if user explicitly indicates something is wrong

Respond ONLY with valid JSON:
{
  "intent": "ADD_CONTENT|CONFIRM|CORRECTION|CANCEL",
  "confidence": 0.0-1.0,
  "extractedData": { "hours": null, "projectHint": null, "workDescription": null }
}`;

    try {
        const completion = await groq.chat.completions.create({
            model: process.env.GENERAL_MODEL ,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 200,
        });

        const responseText = completion.choices?.[0]?.message?.content || '';

        // Parse JSON response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                intent: parsed.intent as Intent,
                confidence: parsed.confidence || 0.8,
                extractedData: parsed.extractedData || {},
            };
        }
    } catch (error) {
        console.error('[ConversationEngine] Intent classification error:', error);
    }

    // Default to ADD_CONTENT if classification fails
    return {
        intent: 'ADD_CONTENT',
        confidence: 0.5,
        extractedData: {},
    };
}

/**
 * Fallback heuristic classification when LLM is not available
 */
function classifyIntentHeuristic(text: string): IntentResult {
    const lower = text.toLowerCase().trim();

    // CONFIRM patterns
    const confirmPatterns = ['ok', 'okay', 'yes', 'yeah', 'yep', 'si', 'correct', 'right', 'fine', 'good', 'looks good', 'that\'s right'];
    if (confirmPatterns.some(p => lower === p || lower === p + '!')) {
        return { intent: 'CONFIRM', confidence: 0.9, extractedData: {} };
    }

    // CANCEL patterns
    const cancelPatterns = ['cancel', 'never mind', 'nevermind', 'forget it', 'stop', 'abort'];
    if (cancelPatterns.some(p => lower.includes(p))) {
        return { intent: 'CANCEL', confidence: 0.9, extractedData: {} };
    }

    // CORRECTION patterns
    const correctionPatterns = ['wrong', 'mistake', 'actually', 'redo', 'fix', 'not right', 'incorrect'];
    if (correctionPatterns.some(p => lower.includes(p))) {
        return { intent: 'CORRECTION', confidence: 0.8, extractedData: {} };
    }

    // Default to ADD_CONTENT
    return { intent: 'ADD_CONTENT', confidence: 0.7, extractedData: {} };
}

// ============================================================================
// Conversation History Management
// ============================================================================

/**
 * Get conversation history from a bucket
 */
export function getConversationHistory(bucket: Bucket): ConversationMessage[] {
    if (!bucket.conversation_history) return [];
    if (typeof bucket.conversation_history === 'string') {
        try {
            return JSON.parse(bucket.conversation_history);
        } catch {
            return [];
        }
    }
    return bucket.conversation_history as ConversationMessage[];
}

/**
 * Append messages to conversation history
 */
export async function appendConversation(
    sql: Sql,
    bucketId: number,
    messages: ConversationMessage[]
): Promise<void> {
    // Add timestamps if not present
    const timestampedMessages = messages.map(m => ({
        ...m,
        timestamp: m.timestamp || new Date().toISOString(),
    }));

    await sql`
        UPDATE buckets 
        SET conversation_history = COALESCE(conversation_history, '[]'::jsonb) || ${JSON.stringify(timestampedMessages)}::jsonb,
            updated_at = NOW()
        WHERE id = ${bucketId}
    `;
    console.log(`[ConversationEngine] Appended ${messages.length} messages to bucket #${bucketId}`);
}

// ============================================================================
// Response Generation
// ============================================================================

export interface ResponseContext {
    bucket: Bucket;
    intent: IntentResult;
    isComplete: boolean;
    validationErrors: string[];
    questions: string[];
    isNewTicket: boolean;
}

/**
 * Generate an appropriate response based on context
 */
export function generateResponse(ctx: ResponseContext): string {
    const { bucket, intent, isComplete, validationErrors, questions, isNewTicket } = ctx;

    switch (intent.intent) {
        case 'CANCEL':
            return `🚫 Ticket #${bucket.id} cancelled. Send a new message when you're ready to log work.`;

        case 'CORRECTION':
            return `No problem! What would you like to correct? Send the updated info or photo.`;

        case 'CONFIRM':
            if (isComplete && validationErrors.length === 0) {
                return `✅ Ticket #${bucket.id} submitted! Thanks for your report.`;
            } else if (validationErrors.length > 0) {
                // User confirmed but there are issues - accept anyway
                return `✅ Ticket #${bucket.id} submitted for review. An admin will follow up if needed.`;
            } else {
                // User confirmed but ticket incomplete
                return `Got it! But we still need: ${questions[0] || 'more details'}`;
            }

        case 'ADD_CONTENT':
        default:
            if (isNewTicket) {
                if (isComplete) {
                    return `✅ Ticket #${bucket.id} opened. Does this look correct? Reply "ok" to submit.`;
                } else {
                    return `📝 Ticket #${bucket.id} opened.\n\n${questions[0] || 'Please add more details.'}`;
                }
            } else {
                if (isComplete) {
                    return `Got it! Ticket #${bucket.id} updated. Does this look correct? Reply "ok" to submit.`;
                } else {
                    return `Ticket #${bucket.id}: ${questions[0] || 'Please add more details.'}`;
                }
            }
    }
}

// ============================================================================
// Bucket Status Updates
// ============================================================================

export type ExtendedBucketStatus = 'open' | 'submitted' | 'pending_review' | 'rejected' | 'cancelled';

/**
 * Update bucket status
 */
export async function updateBucketStatus(
    sql: Sql,
    bucketId: number,
    status: ExtendedBucketStatus
): Promise<void> {
    await sql`
        UPDATE buckets 
        SET status = ${status}, updated_at = NOW()
        WHERE id = ${bucketId}
    `;
    console.log(`[ConversationEngine] Bucket #${bucketId} status → ${status}`);
}

/**
 * Handle bucket cancellation
 */
export async function cancelBucket(sql: Sql, bucketId: number): Promise<void> {
    await updateBucketStatus(sql, bucketId, 'cancelled');
}

/**
 * Submit bucket (mark as submitted or pending_review)
 */
export async function submitBucket(
    sql: Sql,
    bucketId: number,
    hasIssues: boolean
): Promise<void> {
    const status = hasIssues ? 'pending_review' : 'submitted';
    await updateBucketStatus(sql, bucketId, status);
}
