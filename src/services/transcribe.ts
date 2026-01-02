import Groq from 'groq-sdk';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

// Lazy-initialize to ensure dotenv has loaded
let groq: Groq | null = null;
function getGroq(): Groq {
    if (!groq) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groq;
}

export async function transcribeAudio(audioUrl: string, contentType: string): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `upload-${Date.now()}.mp3`);

    try {
        console.log(`🎙️ Transcribing audio from: ${audioUrl}`);

        // Download the Audio File (Groq SDK doesn't support URL parameter reliably)
        console.log(`📥 Downloading audio file...`);
        const response = await fetch(audioUrl);
        if (!response.ok || !response.body) {
            throw new Error(`Failed to fetch audio: ${response.statusText}`);
        }

        // Stream to temp file
        // @ts-ignore - ReadableStream/NodeStream mismatch
        await pipeline(response.body, createWriteStream(tempFilePath));

        // Upload to Groq Whisper
        console.log(`📤 Uploading to Groq Whisper...`);
        const transcription = await getGroq().audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-large-v3",
            response_format: "json",
            temperature: 0.0,
        });

        console.log(`✅ Transcript: "${transcription.text}"`);
        return transcription.text;

    } catch (error) {
        console.error("❌ Transcription Failed:");
        console.error("   URL:", audioUrl);
        console.error("   Type:", contentType);
        console.error("   Error:", error);
        if (error instanceof Error) {
            console.error("   Message:", error.message);
            console.error("   Stack:", error.stack);
        }
        return ""; // Return empty string so the pipeline doesn't crash
    } finally {
        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}