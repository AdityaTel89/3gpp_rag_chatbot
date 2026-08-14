import Groq from "groq-sdk";
import { buildSystemPrompt, formatContext } from "../prompts/systemPrompt";
import { SpecChunk } from "../../../shared/types";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

export async function generateAnswer(query: string, chunks: SpecChunk[]): Promise<string> {
    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not configured.");
    }

    const systemPrompt = buildSystemPrompt();
    const context = formatContext(chunks);

    const userPrompt = `Context:\n${context}\n\nQuestion: ${query}`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            // Use a currently supported fast model on Groq
            model: "llama-3.1-8b-instant",
            temperature: 0.1, // Low temperature for more grounded/factual responses
            max_tokens: 1024,
        });

        return completion.choices[0]?.message?.content || "I'm sorry, an error occurred during generation.";
    } catch (err: any) {
        console.error("[llm.ts] Groq API Error:", err.message);
        throw err;
    }
}
