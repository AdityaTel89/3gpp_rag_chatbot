import Groq from "groq-sdk";
import { buildSystemPrompt, formatContext } from "../prompts/systemPrompt";
import { SpecChunk } from "../../../shared/types";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

export interface LlmResponse {
  claims: { text: string; citedChunkId: string }[];
  abstain: boolean;
}

export async function generateAnswer(query: string, chunks: SpecChunk[], unresolvedRefs?: {specId: string, clauseNumber: string}[]): Promise<LlmResponse> {
    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not configured.");
    }

    const systemPrompt = buildSystemPrompt();
    const context = formatContext(chunks);

    let userPrompt = `Context:\n${context}\n\nQuestion: ${query}`;

    if (unresolvedRefs && unresolvedRefs.length > 0) {
        userPrompt += `\n\nNote: The context mentions dependencies on the following clauses which are NOT indexed. Do NOT hallucinate their contents. If your answer depends on them, state that explicitly:\n`;
        unresolvedRefs.forEach(r => {
            userPrompt += `- ${r.specId} clause ${r.clauseNumber}\n`;
        });
    }

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
            response_format: { type: "json_object" }
        });

        const raw = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(raw);
        return {
            claims: parsed.claims || [],
            abstain: parsed.abstain || false
        };
    } catch (err: any) {
        console.error("[llm.ts] Groq API Error:", err.message);
        throw err;
    }
}
