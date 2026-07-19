import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface AIResult {
    scope: string;
    workers: string[];
    hours: number;
    materials: string[];
}

export async function parseChangeOrder(
    rawText: string,
    senderName: string,
    imageUrl: string | null
): Promise<AIResult> {

    // 1. Construct the User Message (Multimodal)
    const userContent: any[] = [
        { type: "text", text: `Sender: ${senderName}. Message: "${rawText}"` }
    ];

    // If there is an image, attach it for the Vision model
    if (imageUrl) {
        try {
            // Resolve redirect (Twilio -> S3)
            const response = await fetch(imageUrl, { method: 'HEAD', redirect: 'follow' });
            const finalUrl = response.url;
            console.log(`[AI] Resolved Image URL: ${finalUrl}`);

            userContent.push({
                type: "image_url",
                image_url: { url: finalUrl }
            });
        } catch (error) {
            console.error("[AI] Failed to resolve image URL:", error);
            // Fallback to original URL if fetch fails
            userContent.push({
                type: "image_url",
                image_url: { url: imageUrl }
            });
        }
    }

    // 2. Call Groq
    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `You are a Multilingual Construction Assistant.
  
                INPUT RULES:
                1. Detect the language of the user's input (English, Spanish, Portuguese, etc.).
                2. Be extremely lenient with typos (e.g., "clok in", "startn", "aqi").
                
                OUTPUT TASKS:
                1. "intent": Convert input to standard English Intent (CLOCK_IN, CHANGE_ORDER, etc.).
                2. "reply_language": The language code detected (e.g., "es").
                3. "reply_message": A short, simple confirmation in the USER'S language. Use Emojis.
                
                Output strictly JSON.`
            },
            { role: "user", content: userContent }
        ],
        model: "meta-llama/openai/gpt-oss-20b",
        temperature: 0.1,
        response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
}