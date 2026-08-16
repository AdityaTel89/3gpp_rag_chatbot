import { AutoModelForSequenceClassification, AutoTokenizer } from "@xenova/transformers";

let modelPromise: Promise<any> | null = null;
let tokenizerPromise: Promise<any> | null = null;

const MODEL_ID = "Xenova/bge-reranker-base";

export async function getReranker() {
    if (!modelPromise || !tokenizerPromise) {
        console.log(`[reranker] Loading ${MODEL_ID} model (quantized)...`);
        modelPromise = AutoModelForSequenceClassification.from_pretrained(MODEL_ID, { quantized: true });
        tokenizerPromise = AutoTokenizer.from_pretrained(MODEL_ID);
    }
    const [model, tokenizer] = await Promise.all([modelPromise, tokenizerPromise]);
    return { model, tokenizer };
}

export interface RerankCandidate {
    chunkId: string;
    text: string;
}

export async function rerank(
    query: string,
    candidates: RerankCandidate[],
    topN: number = 8
): Promise<(RerankCandidate & { rerankScore: number })[]> {
    if (candidates.length === 0) return [];
    
    const { model, tokenizer } = await getReranker();
    
    const queries = Array(candidates.length).fill(query);
    const docs = candidates.map(c => c.text);
    
    // Xenova/bge-reranker-base requires text pairs for cross-encoder scoring
    const inputs = await tokenizer(queries, { 
        text_pair: docs, 
        padding: true, 
        truncation: true, 
        return_tensors: 'pt' 
    });
    
    const output = await model(inputs);
    
    // The logits array contains the raw scores for each candidate
    const scores = output.logits.data;
    
    const scored = candidates.map((c, i) => {
        return { ...c, rerankScore: scores[i] };
    });
    
    return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topN);
}
