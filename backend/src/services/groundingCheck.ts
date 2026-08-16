import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

export type EntailmentVerdict = "yes" | "no" | "not_stated";

export interface ClaimVerification {
    claimText: string;
    citedChunkId: string;
    verdict: EntailmentVerdict;
}

/**
 * Checks if the generated claims are entailed by the provided chunks.
 */
export async function verifyClaims(
    claims: { text: string; citedChunkId: string }[],
    chunkMap: Map<string, string>
): Promise<ClaimVerification[]> {
    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not configured.");
    }

    const promises = claims.map(async (claim) => {
        const chunkText = chunkMap.get(claim.citedChunkId);

        if (!chunkText) {
            return {
                claimText: claim.text,
                citedChunkId: claim.citedChunkId,
                verdict: "not_stated" as EntailmentVerdict
            };
        }

        const prompt = `Context: "${chunkText}"\nClaim: "${claim.text}"\nIs the claim entailed by the context? Answer only: yes, no, or not_stated.`;

        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                // Use a fast model for entailment
                model: "llama-3.1-8b-instant",
                temperature: 0.0,
                max_tokens: 10,
            });

            const answer = (completion.choices[0]?.message?.content || "").trim().toLowerCase();
            let verdict: EntailmentVerdict = "not_stated";
            
            if (answer.includes("yes")) {
                verdict = "yes";
            } else if (answer.includes("no") && !answer.includes("not")) {
                verdict = "no";
            }

            return {
                claimText: claim.text,
                citedChunkId: claim.citedChunkId,
                verdict
            };
        } catch (err: any) {
            console.error(`[verifyClaims] Error verifying claim: ${err.message}`);
            return {
                claimText: claim.text,
                citedChunkId: claim.citedChunkId,
                verdict: "not_stated" as EntailmentVerdict
            };
        }
    });

    return Promise.all(promises);
}
