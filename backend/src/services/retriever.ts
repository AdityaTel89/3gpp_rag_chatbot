import { supabase } from "./supabaseClient";
import { embedTexts } from "./embedder";

export interface RetrievalResult {
    id: string;
    spec_id: string;
    release: string;
    clause_number: string;
    clause_title: string | null;
    page_number: number | null;
    chunk_index: number;
    text: string;
    score: number; // The fused RRF score
}

/**
 * Gets a 384-dimensional embedding for a single string query.
 */
export async function getQueryEmbedding(query: string): Promise<number[]> {
    const embeddings = await embedTexts([query]);
    return embeddings[0];
}

/**
 * Searches the vector index using cosine similarity.
 */
export async function vectorSearch(embedding: number[], limit: number = 20): Promise<any[]> {
    const { data, error } = await supabase.rpc("match_chunks_vector", {
        // pgvector in Supabase often works best passing the raw array directly, 
        // but if it fails, it can be cast to string: `[${embedding.join(",")}]`
        query_embedding: embedding as any, 
        match_limit: limit
    });

    if (error) {
        console.error("[retriever] Vector search error:", error);
        throw error;
    }
    return data || [];
}

/**
 * Searches using full-text search (BM25-style keyword search).
 */
export async function keywordSearch(query: string, limit: number = 20): Promise<any[]> {
    const { data, error } = await supabase
        .from("spec_chunks")
        .select("id, spec_id, release, clause_number, clause_title, page_number, chunk_index, text")
        // Use the generated 'fts' column directly
        .textSearch("fts", query, {
            type: "websearch",
            config: "english"
        })
        .limit(limit);

    if (error) {
        console.error("[retriever] Keyword search error:", error);
        throw error;
    }
    return data || [];
}

/**
 * Performs a hybrid search (vector + keyword) and fuses results using Reciprocal Rank Fusion (RRF).
 */
export async function hybridSearch(query: string, limit: number = 10): Promise<RetrievalResult[]> {
    console.log(`[retriever] Getting embedding for query: "${query}"`);
    const embedding = await getQueryEmbedding(query);

    console.log(`[retriever] Running vector and keyword search concurrently...`);
    // Retrieve a larger candidate pool before fusing
    const CANDIDATE_LIMIT = 30;
    const [vectorResults, keywordResults] = await Promise.all([
        vectorSearch(embedding, CANDIDATE_LIMIT),
        keywordSearch(query, CANDIDATE_LIMIT)
    ]);

    console.log(`[retriever] Found ${vectorResults.length} vector hits, ${keywordResults.length} keyword hits.`);

    // Reciprocal Rank Fusion
    const RRF_K = 60;
    const scores = new Map<string, number>();
    const chunks = new Map<string, any>();

    // Score vector results
    vectorResults.forEach((chunk, index) => {
        const rank = index + 1;
        const score = 1 / (RRF_K + rank);
        scores.set(chunk.id, score);
        chunks.set(chunk.id, chunk);
    });

    // Score keyword results
    keywordResults.forEach((chunk, index) => {
        const rank = index + 1;
        const score = 1 / (RRF_K + rank);
        const currentScore = scores.get(chunk.id) || 0;
        scores.set(chunk.id, currentScore + score);
        chunks.set(chunk.id, chunk);
    });

    // Combine and sort
    const fusedResults: RetrievalResult[] = Array.from(scores.entries())
        .map(([id, score]) => {
            const chunk = chunks.get(id);
            return {
                id: chunk.id,
                spec_id: chunk.spec_id,
                release: chunk.release,
                clause_number: chunk.clause_number,
                clause_title: chunk.clause_title,
                page_number: chunk.page_number,
                chunk_index: chunk.chunk_index,
                text: chunk.text,
                score
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    console.log(`[retriever] Top RRF score: ${fusedResults[0]?.score?.toFixed(4)}`);
    return fusedResults;
}
