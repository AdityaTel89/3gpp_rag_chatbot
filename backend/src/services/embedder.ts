import { pipeline } from "@xenova/transformers";

let embedderPromise: Promise<any> | null = null;

function getEmbedder() {
    if (!embedderPromise) {
        console.log("[embedder] Loading bge-m3 model (first run downloads ~1GB+)...");
        embedderPromise = pipeline("feature-extraction", "Xenova/bge-m3");
    }
    return embedderPromise;
}

const BATCH_SIZE = 32;

/**
 * Embed an array of texts using bge-m3 (1024 dimensions).
 * Returns a parallel array of embedding vectors.
 * Empty/whitespace-only texts are replaced with a zero vector.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
    const embedder = await getEmbedder();
    const results: number[][] = new Array(texts.length);
    const ZERO_VEC = new Array(1024).fill(0);

    for (let batchStart = 0; batchStart < texts.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, texts.length);
        const batch = texts.slice(batchStart, batchEnd);

        console.log(
            `[embedder] Embedding batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} ` +
            `(items ${batchStart + 1}–${batchEnd} of ${texts.length})`
        );

        for (let i = 0; i < batch.length; i++) {
            const text = batch[i].trim();
            if (!text) {
                results[batchStart + i] = ZERO_VEC;
                continue;
            }
            const output = await embedder(text, { pooling: "mean", normalize: true });
            results[batchStart + i] = Array.from(output.data as Float32Array);
        }
    }

    return results;
}