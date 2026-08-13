import { pipeline } from "@xenova/transformers";

let embedderPromise: Promise<any> | null = null;

function getEmbedder() {
    if (!embedderPromise) {
        embedderPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    return embedderPromise;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    const embedder = await getEmbedder();
    const results: number[][] = [];

    // Batch sequentially for MVP simplicity — parallelize later if ingestion is slow.
    for (const text of texts) {
        const output = await embedder(text, { pooling: "mean", normalize: true });
        results.push(Array.from(output.data));
    }

    return results;
}