import { Queue, QueueMessage, EnqueuePayload } from './types.js';
import { randomUUID } from 'crypto';

/**
 * In-memory queue for local development.
 * Messages are processed by a background worker polling this queue.
 */
export class LocalQueue implements Queue {
    private messages: QueueMessage[] = [];
    private inFlight: Map<string, QueueMessage> = new Map();
    private deadLetter: QueueMessage[] = [];

    private readonly maxRetries = 3;

    async enqueue(payload: EnqueuePayload): Promise<string> {
        const messageId = randomUUID();
        const message: QueueMessage = {
            messageId,
            userId: payload.userId,
            companyId: payload.companyId,
            domain: payload.domain,
            source: payload.source,
            fromPhone: payload.fromPhone,
            textBody: payload.textBody,
            imageUrl: payload.imageUrl,
            audioUrl: payload.audioUrl,
            originalImageUrl: payload.imageUrl,  // In local, same as S3 URL
            originalAudioUrl: payload.audioUrl,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        };

        this.messages.push(message);
        console.log(`[LocalQueue] Enqueued message ${messageId} [${payload.source}] for domain: ${payload.domain}`);
        return messageId;
    }

    async dequeue(): Promise<QueueMessage | null> {
        const message = this.messages.shift();
        if (!message) {
            return null;
        }

        // Track in-flight messages
        this.inFlight.set(message.messageId, message);
        console.log(`[LocalQueue] Dequeued message ${message.messageId}`);
        return message;
    }

    async acknowledge(messageId: string): Promise<void> {
        this.inFlight.delete(messageId);
        console.log(`[LocalQueue] Acknowledged message ${messageId}`);
    }

    async fail(messageId: string, error: Error): Promise<void> {
        const message = this.inFlight.get(messageId);
        if (!message) {
            console.warn(`[LocalQueue] Cannot fail unknown message ${messageId}`);
            return;
        }

        this.inFlight.delete(messageId);

        if (message.retryCount < this.maxRetries) {
            // Re-queue with incremented retry count
            message.retryCount++;
            this.messages.push(message);
            console.log(`[LocalQueue] Re-queued message ${messageId} (retry ${message.retryCount}/${this.maxRetries})`);
        } else {
            // Move to dead letter queue
            this.deadLetter.push(message);
            console.error(`[LocalQueue] Message ${messageId} moved to dead-letter after ${this.maxRetries} retries: ${error.message}`);
        }
    }

    // Utility methods for testing/debugging
    getQueueLength(): number {
        return this.messages.length;
    }

    getInFlightCount(): number {
        return this.inFlight.size;
    }

    getDeadLetterCount(): number {
        return this.deadLetter.length;
    }
}

// Singleton instance for local development
let localQueueInstance: LocalQueue | null = null;

export function getLocalQueue(): LocalQueue {
    if (!localQueueInstance) {
        localQueueInstance = new LocalQueue();
    }
    return localQueueInstance;
}
