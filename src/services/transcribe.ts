import Groq from 'groq-sdk';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function transcribeAudio(audioUrl: string, contentType: string): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `upload-${Date.now()}.mp3`);

    try {
        console.log(`🎙️ Fetching audio from: ${audioUrl}`);

        // 1. Download the Audio File (Stream to /tmp to save RAM)
        const response = await fetch(audioUrl);
        if (!response.ok || !response.body) {
            throw new Error(`Failed to fetch audio: ${response.statusText}`);
        }

        // Node.js specific: Write web stream to file system
        // @ts-ignore - ReadableStream/NodeStream mismatch is common in Lambda types, pipeline handles it
        await pipeline(response.body, createWriteStream(tempFilePath));

        // 2. Send to Groq Whisper
        console.log(`📤 Sending to Groq Whisper...`);

        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-large-v3", // The best model for multi-language support
            response_format: "json",
            temperature: 0.0, // Strict decoding
            language: "en", // Optional: Remove to enable auto-detect (Polyglot mode)
        });

        console.log(`✅ Transcript: "${transcription.text}"`);
        return transcription.text;

    } catch (error) {
        console.error("❌ Transcription Failed:", error);
        return ""; // Return empty string so the pipeline doesn't crash
    } finally {
        // 3. Cleanup: Always delete the temp file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}