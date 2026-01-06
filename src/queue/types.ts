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

export interface QueueMessage extends EnqueuePayload {
    messageId: string;
    timestamp: string;
    retryCount: number;
}

export interface BucketMessage {
    bucketId: number;
    messageId: string; // Twilio MessageSid
    timestamp: string;
}

export interface EnqueuePayload {
    userId: number;
    companyId: number;
    domain: string;
    source: MessageSource;
    fromPhone: string;
    textBody: string;
    imageUrl: string | null;
    audioUrl: string | null;
}

// ============================================================================
// Queue Interface (Abstract)
// ============================================================================

export interface Queue {
    enqueue(payload: EnqueuePayload): Promise<string>;
    enqueueBucket(payload: BucketMessage): Promise<string>;
    dequeue(): Promise<QueueMessage | null>;
    dequeueBucket(): Promise<BucketMessage | null>;
    acknowledge(messageId: string): Promise<void>;
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
