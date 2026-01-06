import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// Lazy-initialize Supabase client
let supabaseClient: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient {
    if (!supabaseClient) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
        }

        supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
    return supabaseClient;
}

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'media';

export interface MediaUploadResult {
    imageUrl: string | null;
    audioUrl: string | null;
    originalImageUrl: string | null;
    originalAudioUrl: string | null;
}

export interface TwilioMedia {
    url: string;
    contentType: string;
}

/**
 * Download media from Twilio and upload to Supabase Storage.
 * Used by the background worker (async copy).
 */
export async function copyTwilioMediaToStorage(
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
            result.imageUrl = await downloadAndUploadToSupabase(
                lastImage.url,
                lastImage.contentType,
                messageId,
                'images'
            );
            console.log(`📸 Image copied to Supabase: ${result.imageUrl}`);
        } catch (error) {
            console.error('❌ Failed to copy image to Supabase:', error);
            result.imageUrl = lastImage.url; // Fallback to original
        }
    }

    // Process audio (use last one if multiple)
    if (twilioAudio.length > 0) {
        const lastAudio = twilioAudio[twilioAudio.length - 1];
        result.originalAudioUrl = lastAudio.url;

        try {
            result.audioUrl = await downloadAndUploadToSupabase(
                lastAudio.url,
                lastAudio.contentType,
                messageId,
                'audio'
            );
            console.log(`🎵 Audio copied to Supabase: ${result.audioUrl}`);
        } catch (error) {
            console.error('❌ Failed to copy audio to Supabase:', error);
            result.audioUrl = lastAudio.url; // Fallback to original
        }
    }

    return result;
}

/**
 * Download from URL and upload to Supabase Storage
 */
async function downloadAndUploadToSupabase(
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

    // 2. Generate storage path
    const extension = getExtensionFromContentType(contentType);
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const path = `${folder}/${timestamp}/${messageId}-${randomUUID().slice(0, 8)}${extension}`;

    // 3. Upload to Supabase Storage
    console.log(`📤 Uploading to Supabase Storage: ${path}`);
    const supabase = getSupabaseClient();

    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, Buffer.from(buffer), {
            contentType,
            upsert: false,
        });

    if (error) {
        throw new Error(`Supabase upload failed: ${error.message}`);
    }

    // 4. Get public URL
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
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
 * For local development - just use original Twilio URLs
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

    if (twilioImages.length > 0) {
        const lastImage = twilioImages[twilioImages.length - 1];
        result.originalImageUrl = lastImage.url;
        result.imageUrl = lastImage.url;
    }

    if (twilioAudio.length > 0) {
        const lastAudio = twilioAudio[twilioAudio.length - 1];
        result.originalAudioUrl = lastAudio.url;
        result.audioUrl = lastAudio.url;
    }

    return result;
}

/**
 * Copy media based on DEPLOY_MODE
 * - 'local': Use raw Twilio URLs (no copy)
 * - 'remote' or 'production': Copy to Supabase Storage
 */
export async function copyTwilioMedia(
    twilioImages: TwilioMedia[],
    twilioAudio: TwilioMedia[],
    messageId: string
): Promise<MediaUploadResult> {
    const mode = process.env.DEPLOY_MODE || 'local';

    if (mode === 'remote' || mode === 'production') {
        return copyTwilioMediaToStorage(twilioImages, twilioAudio, messageId);
    }
    return copyTwilioMediaLocal(twilioImages, twilioAudio, messageId);
}
