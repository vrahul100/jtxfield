import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

// Lazy-initialize S3 client
let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
    if (!s3Client) {
        s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
        });
    }
    return s3Client;
}

const BUCKET_NAME = process.env.S3_MEDIA_BUCKET || 'jtxfield-media';

export interface MediaUploadResult {
    imageUrl: string | null;
    audioUrl: string | null;
    originalImageUrl: string | null;
    originalAudioUrl: string | null;
}

interface TwilioMedia {
    url: string;
    contentType: string;
}

/**
 * Download media from Twilio and upload to S3 for permanent storage.
 * Twilio media URLs expire, so we need to copy them before queueing.
 */
export async function copyTwilioMediaToS3(
    twilioImages: TwilioMedia[],
    twilioAudio: TwilioMedia[],
    messageId: string
): Promise<MediaUploadResult> {
    const result: MediaUploadResult = {
        imageUrl: null,
        audioUrl: null,
        originalImageUrl: null,
        originalAudioUrl: null,
    };

    // Process images (use last one if multiple)
    if (twilioImages.length > 0) {
        const lastImage = twilioImages[twilioImages.length - 1];
        result.originalImageUrl = lastImage.url;

        try {
            result.imageUrl = await downloadAndUploadToS3(
                lastImage.url,
                lastImage.contentType,
                messageId,
                'images'
            );
            console.log(`📸 Image copied to S3: ${result.imageUrl}`);
        } catch (error) {
            console.error('❌ Failed to copy image to S3:', error);
            // Fallback to original URL (may expire)
            result.imageUrl = lastImage.url;
        }
    }

    // Process audio (use last one if multiple)
    if (twilioAudio.length > 0) {
        const lastAudio = twilioAudio[twilioAudio.length - 1];
        result.originalAudioUrl = lastAudio.url;

        try {
            result.audioUrl = await downloadAndUploadToS3(
                lastAudio.url,
                lastAudio.contentType,
                messageId,
                'audio'
            );
            console.log(`🎵 Audio copied to S3: ${result.audioUrl}`);
        } catch (error) {
            console.error('❌ Failed to copy audio to S3:', error);
            // Fallback to original URL (may expire)
            result.audioUrl = lastAudio.url;
        }
    }

    return result;
}

/**
 * Download from URL and upload to S3
 */
async function downloadAndUploadToS3(
    sourceUrl: string,
    contentType: string,
    messageId: string,
    folder: 'images' | 'audio'
): Promise<string> {
    // 1. Download from Twilio
    console.log(`📥 Downloading from Twilio: ${sourceUrl}`);
    const response = await fetch(sourceUrl);

    if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();

    // 2. Generate S3 key
    const extension = getExtensionFromContentType(contentType);
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${folder}/${timestamp}/${messageId}-${randomUUID().slice(0, 8)}${extension}`;

    // 3. Upload to S3
    console.log(`📤 Uploading to S3: ${key}`);
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: Buffer.from(buffer),
        ContentType: contentType,
    });

    await getS3Client().send(command);

    // 4. Return S3 URL
    const region = process.env.AWS_REGION || 'us-east-1';
    return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Get file extension from content type
 */
function getExtensionFromContentType(contentType: string): string {
    const mapping: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'audio/mpeg': '.mp3',
        'audio/ogg': '.ogg',
        'audio/wav': '.wav',
        'audio/amr': '.amr',
        'audio/3gpp': '.3gp',
    };
    return mapping[contentType] || '';
}

/**
 * For local development - store media locally instead of S3
 */
export async function copyTwilioMediaLocal(
    twilioImages: TwilioMedia[],
    twilioAudio: TwilioMedia[],
    messageId: string
): Promise<MediaUploadResult> {
    const result: MediaUploadResult = {
        imageUrl: null,
        audioUrl: null,
        originalImageUrl: null,
        originalAudioUrl: null,
    };

    // In local dev, just use the original URLs
    // They'll work for testing but may expire
    if (twilioImages.length > 0) {
        const lastImage = twilioImages[twilioImages.length - 1];
        result.originalImageUrl = lastImage.url;
        result.imageUrl = lastImage.url; // Use original in local dev
    }

    if (twilioAudio.length > 0) {
        const lastAudio = twilioAudio[twilioAudio.length - 1];
        result.originalAudioUrl = lastAudio.url;
        result.audioUrl = lastAudio.url; // Use original in local dev
    }

    return result;
}

/**
 * Copy media based on environment
 */
export async function copyTwilioMedia(
    twilioImages: TwilioMedia[],
    twilioAudio: TwilioMedia[],
    messageId: string
): Promise<MediaUploadResult> {
    if (process.env.NODE_ENV === 'production') {
        return copyTwilioMediaToS3(twilioImages, twilioAudio, messageId);
    }
    return copyTwilioMediaLocal(twilioImages, twilioAudio, messageId);
}
