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
        userContent.push({
            type: "image_url",
            image_url: { url: imageUrl }
        });
    }

    // 2. Call Groq
    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `You are a Construction Admin. 
        Analyze the text and image to extract billable work.
        
        RULES:
        1. "scope": Professional description of work. Use the image to add details (e.g., "Moved 2-inch EMT conduit" vs just "Moved pipe").
        2. "workers": List names. If text says "Me", use "${senderName}".
        3. "hours": Infer duration per person. Default to 1.0 if missing.
        4. "materials": List visible or mentioned materials.
        
        Output strictly JSON.`
            },
            { role: "user", content: userContent }
        ],
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.1,
        response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
}