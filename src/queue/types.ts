import { Sql } from 'postgres';

// ============================================================================
// Message Source Types (SMS vs WhatsApp)
// ============================================================================

export type MessageSource = 'sms' | 'whatsapp';

export interface NormalizedMessage {
    messageId: string;    // Twilio's MessageSid
    sender: string;       // The raw phone number (no "whatsapp:" prefix)
    source: MessageSource;
    text: string;         // The message body
    media: Array<{
        url: string;
        contentType: string;
    }>;
    timestamp: string;
}

// ============================================================================
// Queue Message Types
// ============================================================================

export interface QueueMessage {
    messageId: string;
    userId: number;
    companyId: number;
    domain: string;  // 'construction' | 'logistics' | etc.
    source: MessageSource;  // 'sms' | 'whatsapp'
    fromPhone: string;
    textBody: string;
    // S3 URLs (permanent storage)
    imageUrl: string | null;
    audioUrl: string | null;
    // Original Twilio URLs (for reference, may expire)
    originalImageUrl: string | null;
    originalAudioUrl: string | null;
    timestamp: string;
    retryCount: number;
}

export interface EnqueuePayload {
    userId: number;
    companyId: number;
    domain: string;
    source: MessageSource;  // 'sms' | 'whatsapp'
    fromPhone: string;
    textBody: string;
    // S3 URLs (after copying from Twilio)
    imageUrl: string | null;
    audioUrl: string | null;
}

// ============================================================================
// Queue Interface (Abstract)
// ============================================================================

export interface Queue {
    /**
     * Add a message to the queue
     */
    enqueue(payload: EnqueuePayload): Promise<string>;

    /**
     * Retrieve the next message from the queue (for local worker)
     */
    dequeue(): Promise<QueueMessage | null>;

    /**
     * Acknowledge successful processing (removes from queue)
     */
    acknowledge(messageId: string): Promise<void>;

    /**
     * Mark message as failed (for retry or dead-letter)
     */
    fail(messageId: string, error: Error): Promise<void>;
}

// ============================================================================
// Domain Processor Interface
// ============================================================================

export interface AIResult {
    scope: string;
    workers: string[];
    hours: number;
    materials: string[];
    [key: string]: unknown;  // Allow domain-specific fields
}

export interface ProcessorResult {
    success: boolean;
    aiResult?: AIResult;
    error?: string;
}

export interface DomainProcessor {
    /**
     * The domain this processor handles (e.g., 'construction', 'logistics')
     */
    readonly domain: string;

    /**
     * Process a queued message with domain-specific AI prompts
     */
    process(message: QueueMessage, sql: Sql): Promise<ProcessorResult>;

    /**
     * Get the system prompt for this domain
     */
    getSystemPrompt(): string;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
    valid: boolean;
    error?: string;
    sanitizedData?: {
        fromPhone: string;
        textBody: string;
        imageUrl: string | null;
    };
}
