import { ValidationResult } from '../queue/types.js';

interface TwilioBody {
    From?: string;
    Body?: string;
    NumMedia?: string;
    [key: string]: string | undefined;
}

// Allowed media content types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/amr', 'audio/3gpp'];
const ALLOWED_CONTENT_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES];

// Phone number regex (E.164 format)
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Validates incoming Twilio webhook data before queuing.
 */
export class MediaValidator {
    /**
     * Validate the incoming request body
     */
    async validate(body: TwilioBody): Promise<ValidationResult> {
        const fromPhone = body.From;
        const textBody = body.Body || '';
        const numMedia = parseInt(body.NumMedia || '0', 10);

        // 1. Validate phone number
        if (!fromPhone) {
            return { valid: false, error: 'Missing From field' };
        }
        if (!PHONE_REGEX.test(fromPhone)) {
            return { valid: false, error: 'Invalid phone number format' };
        }

        // 2. Check we have content (text or media)
        if (!textBody && numMedia === 0) {
            return { valid: false, error: 'Message has no content (no text and no media)' };
        }

        // 3. Validate media content types
        let imageUrl: string | null = null;
        for (let i = 0; i < numMedia; i++) {
            const contentType = body[`MediaContentType${i}`];
            const mediaUrl = body[`MediaUrl${i}`];

            if (!contentType || !mediaUrl) {
                continue;  // Skip incomplete media entries
            }

            if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
                console.warn(`[MediaValidator] Unsupported content type: ${contentType}`);
                // Don't reject, just skip unsupported types
                continue;
            }

            // Keep track of the last valid image URL
            if (ALLOWED_IMAGE_TYPES.includes(contentType)) {
                imageUrl = mediaUrl;
            }
        }

        return {
            valid: true,
            sanitizedData: {
                fromPhone,
                textBody,
                imageUrl,
            },
        };
    }

    /**
     * Quick validation for fast webhook response
     */
    quickValidate(body: TwilioBody): { valid: boolean; error?: string } {
        const fromPhone = body.From;
        const textBody = body.Body || '';
        const numMedia = parseInt(body.NumMedia || '0', 10);

        if (!fromPhone) {
            return { valid: false, error: 'Missing From field' };
        }

        if (!textBody && numMedia === 0) {
            return { valid: false, error: 'No content' };
        }

        return { valid: true };
    }
}

// Singleton instance
const validatorInstance = new MediaValidator();

export function getMediaValidator(): MediaValidator {
    return validatorInstance;
}
