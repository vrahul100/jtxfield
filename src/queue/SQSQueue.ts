import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { Queue, QueueMessage, EnqueuePayload } from './types.js';
import { randomUUID } from 'crypto';

/**
 * AWS SQS queue implementation for production.
 * In Lambda, messages are received via SQS trigger, not polling.
 */
export class SQSQueue implements Queue {
    private client: SQSClient;
    private queueUrl: string;

    constructor(queueUrl?: string, region?: string) {
        this.queueUrl = queueUrl || process.env.SQS_QUEUE_URL || '';
        this.client = new SQSClient({
            region: region || process.env.AWS_REGION || 'us-east-1',
        });

        if (!this.queueUrl) {
            console.warn('[SQSQueue] No queue URL configured. Set SQS_QUEUE_URL environment variable.');
        }
    }

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
            originalImageUrl: payload.imageUrl,  // S3 URL is now the permanent copy
            originalAudioUrl: payload.audioUrl,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        };

        const command = new SendMessageCommand({
            QueueUrl: this.queueUrl,
            MessageBody: JSON.stringify(message),
            MessageGroupId: payload.domain,  // FIFO queue grouping by domain
            MessageDeduplicationId: messageId,
        });

        try {
            const response = await this.client.send(command);
            console.log(`[SQSQueue] Enqueued message ${messageId}, SQS MessageId: ${response.MessageId}`);
            return messageId;
        } catch (error) {
            console.error('[SQSQueue] Failed to enqueue message:', error);
            throw error;
        }
    }

    async dequeue(): Promise<QueueMessage | null> {
        // Note: In production Lambda, messages come via SQS trigger, not polling.
        // This method is provided for completeness/testing.
        const command = new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 5,
        });

        try {
            const response = await this.client.send(command);
            if (!response.Messages || response.Messages.length === 0) {
                return null;
            }

            const sqsMessage = response.Messages[0];
            const message = JSON.parse(sqsMessage.Body || '{}') as QueueMessage;

            // Store receipt handle for acknowledgment
            (message as any)._receiptHandle = sqsMessage.ReceiptHandle;

            return message;
        } catch (error) {
            console.error('[SQSQueue] Failed to dequeue message:', error);
            return null;
        }
    }

    async acknowledge(messageId: string): Promise<void> {
        // In Lambda SQS trigger, successful return = automatic acknowledgment
        console.log(`[SQSQueue] Message ${messageId} acknowledged (Lambda auto-deletes on success)`);
    }

    async acknowledgeWithReceiptHandle(receiptHandle: string): Promise<void> {
        const command = new DeleteMessageCommand({
            QueueUrl: this.queueUrl,
            ReceiptHandle: receiptHandle,
        });

        try {
            await this.client.send(command);
            console.log('[SQSQueue] Message deleted from queue');
        } catch (error) {
            console.error('[SQSQueue] Failed to delete message:', error);
            throw error;
        }
    }

    async fail(messageId: string, error: Error): Promise<void> {
        // In Lambda SQS trigger, throwing an error = message returns to queue for retry
        console.error(`[SQSQueue] Message ${messageId} failed: ${error.message}`);
        // SQS handles retry automatically based on queue configuration
    }
}

// Singleton instance for production
let sqsQueueInstance: SQSQueue | null = null;

export function getSQSQueue(): SQSQueue {
    if (!sqsQueueInstance) {
        sqsQueueInstance = new SQSQueue();
    }
    return sqsQueueInstance;
}
