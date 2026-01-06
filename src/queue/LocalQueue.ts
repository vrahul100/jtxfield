import { Queue, QueueMessage, EnqueuePayload, BucketMessage } from './types.js';
import { randomUUID } from 'crypto';

/**
 * In-memory queue for local development.
 * Messages are processed by a background worker polling this queue.
 */
export class LocalQueue implements Queue {
    private messages: QueueMessage[] = [];
    private bucketMessages: BucketMessage[] = [];
    private inFlight: Map<string, QueueMessage | BucketMessage> = new Map();
    private deadLetter: (QueueMessage | BucketMessage)[] = [];

    private readonly maxRetries = 3;

    async enqueue(payload: EnqueuePayload): Promise<string> {
        const messageId = randomUUID();
        const message: QueueMessage = {
            ...payload,
            messageId,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        };

        this.messages.push(message);
        console.log(`[LocalQueue] Enqueued message ${messageId} [${payload.source}] for domain: ${payload.domain}`);
        return messageId;
    }

    async enqueueBucket(payload: BucketMessage): Promise<string> {
        this.bucketMessages.push(payload);
        console.log(`[LocalQueue] Enqueued bucket #${payload.bucketId} (Message: ${payload.messageId})`);
        return payload.messageId;
    }

    async dequeue(): Promise<QueueMessage | null> {
        const message = this.messages.shift();
        if (!message) return null;
        this.inFlight.set(message.messageId, message);
        return message;
    }

    async dequeueBucket(): Promise<BucketMessage | null> {
        const message = this.bucketMessages.shift();
        if (!message) return null;
        this.inFlight.set(message.messageId, message);
        return message;
    }

    async acknowledge(messageId: string): Promise<void> {
        this.inFlight.delete(messageId);
        console.log(`[LocalQueue] Acknowledged message ${messageId}`);
    }

    private isQueueMessage(msg: any): msg is QueueMessage {
        return 'retryCount' in msg;
    }

    async fail(messageId: string, error: Error): Promise<void> {
        const message = this.inFlight.get(messageId);
        if (!message) {
            console.warn(`[LocalQueue] Cannot fail unknown message ${messageId}`);
            return;
        }

        this.inFlight.delete(messageId);

        if (this.isQueueMessage(message)) {
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
        } else {
            // BucketMessage - no retry logic for now, just move to dead letter if it fails
            this.deadLetter.push(message);
            console.error(`[LocalQueue] Bucket message ${messageId} failed: ${error.message}`);
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
