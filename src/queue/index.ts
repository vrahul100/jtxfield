import { Queue } from './types.js';
import { QueueMessage, EnqueuePayload } from './types.js';
import { LocalQueue, getLocalQueue } from './LocalQueue.js';
import { SQSQueue, getSQSQueue } from './SQSQueue.js';

export type QueueType = 'local' | 'sqs';

/**
 * Factory to get the appropriate queue implementation based on environment.
 */
export function getQueue(type?: QueueType): Queue {
    const queueType = type || (process.env.NODE_ENV === 'production' ? 'sqs' : 'local');

    switch (queueType) {
        case 'sqs':
            console.log('[QueueFactory] Using SQS queue');
            return getSQSQueue();

        case 'local':
        default:
            console.log('[QueueFactory] Using local in-memory queue');
            return getLocalQueue();
    }
}

/**
 * Check if we're running in local development mode
 */
export function isLocalDevelopment(): boolean {
    return process.env.NODE_ENV !== 'production';
}

// Re-export types and implementations for convenience
export type { Queue, QueueMessage, EnqueuePayload };
export { LocalQueue, getLocalQueue };
export { SQSQueue, getSQSQueue };

