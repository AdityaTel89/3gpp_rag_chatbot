import { SpecChunk } from "../../../shared/types";

export interface GroundingResult {
    isGrounded: boolean;
    reason?: string;
}

/**
 * Checks if the generated answer is grounded in the provided chunks.
 * Uses a heuristic:
 * 1. Ensure any inline citations [1], [2] actually map to an index in the chunks array.
 * 2. If it's a known abstention string, it's safe (returns isGrounded = true).
 */
export function checkGrounding(answer: string, chunks: SpecChunk[]): GroundingResult {
    // If it's the exact abstention message, it's considered safely handled (not a hallucination).
    if (answer.includes("I'm sorry, I cannot answer this question based on the provided 3GPP specifications")) {
        return { isGrounded: true };
    }

    // 1. Verify Citation Indices
    // Find all [d+] patterns in the answer
    const citationRegex = /\[(\d+)\]/g;
    let match;
    const citedIndices = new Set<number>();
    
    while ((match = citationRegex.exec(answer)) !== null) {
        // Parse the number (it's 1-based in the prompt, so subtract 1 for 0-based array index)
        const index = parseInt(match[1], 10) - 1;
        citedIndices.add(index);
    }

    // If there are no citations but the answer is not an abstention, we might flag it as ungrounded.
    // However, sometimes it provides general context. Let's be strict: if it's answering, it must cite.
    if (citedIndices.size === 0) {
        return { 
            isGrounded: false, 
            reason: "The answer contains no citations." 
        };
    }

    for (const index of citedIndices) {
        if (index < 0 || index >= chunks.length) {
            return {
                isGrounded: false,
                reason: `The answer cited an invalid source index: [${index + 1}]`
            };
        }
    }

    // 2. Lexical Overlap (Basic Heuristic)
    // We expect some non-trivial words in the answer to appear in the context.
    // For a production system, this could be more sophisticated (e.g., using LLM-as-a-judge).
    const answerWords = answer.toLowerCase().match(/\b\w{4,}\b/g) || [];
    let overlapCount = 0;

    // Combine all text from cited chunks
    const citedText = Array.from(citedIndices)
        .map(i => chunks[i].content)
        .join(" ")
        .toLowerCase();

    for (const word of answerWords) {
        // Skip common stop words roughly if needed, but since we require length >= 4, it filters out some.
        if (citedText.includes(word)) {
            overlapCount++;
        }
    }

    // Require at least some overlap to be considered grounded (e.g., 20% of significant words)
    // This is a naive heuristic but works as a first pass.
    if (answerWords.length > 0) {
        const overlapRatio = overlapCount / answerWords.length;
        if (overlapRatio < 0.2) {
            return {
                isGrounded: false,
                reason: `Low lexical overlap with cited sources (${Math.round(overlapRatio * 100)}%). Potential hallucination.`
            };
        }
    }

    return { isGrounded: true };
}
