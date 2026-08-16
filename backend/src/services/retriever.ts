import { supabase } from "./supabaseClient";
import { embedTexts } from "./embedder";
import { loadAcronyms, expandQuery } from "./acronymExpander";
import { rerank } from "./reranker";
import { expandReferences } from "./refExpander";

export interface RetrievalResult {
    id: string;
    spec_id: string;
    release: string;
    spec_version: string;
    clause_number: string;
    clause_title: string | null;
    page_number: number | null;
    chunk_index: number;
    text: string;
    score: number; // The fused RRF score
}

export async function getLatestVersions(specIds?: string[]): Promise<Map<string, string>> {
    let query = supabase.from("spec_chunks").select("spec_id, spec_version");
    if (specIds && specIds.length > 0) {
        query = query.in("spec_id", specIds);
    }
    const { data, error } = await query;
    if (error) {
        console.error("[retriever] getLatestVersions error:", error);
        return new Map();
    }
    
    // Group by spec_id and find max version
    const latest = new Map<string, string>();
    for (const row of data || []) {
        const current = latest.get(row.spec_id);
        if (!current) {
            latest.set(row.spec_id, row.spec_version);
        } else {
            // Simple string comparison for versions (e.g. "17.4.0" > "17.0.0")
            if (row.spec_version.localeCompare(current, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
                latest.set(row.spec_id, row.spec_version);
            }
        }
    }
    return latest;
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
export async function vectorSearch(embedding: number[], limit: number = 20, specFilter?: string, versionFilter?: string): Promise<any[]> {
    // Single function exists in DB with DEFAULT NULL params — pass all args directly.
    const { data, error } = await supabase.rpc("match_chunks_vector", {
        query_embedding: embedding as unknown as string, // pgvector accepts number[] serialized by Supabase
        match_limit: limit,
        filter_spec_id: specFilter || undefined,
        filter_spec_version: versionFilter || undefined,
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
export async function keywordSearch(query: string, limit: number = 20, specFilter?: string, versionFilter?: string): Promise<any[]> {
    let queryBuilder = supabase
        .from("spec_chunks")
        .select("id, spec_id, release, spec_version, clause_number, clause_title, page_number, chunk_index, text")
        // Use the generated 'fts' column directly
        .textSearch("fts", query, {
            type: "websearch",
            config: "english"
        });

    if (specFilter) {
        queryBuilder = queryBuilder.eq("spec_id", specFilter);
    }
    if (versionFilter) {
        queryBuilder = queryBuilder.eq("spec_version", versionFilter);
    }

    const { data, error } = await queryBuilder.limit(limit);

    if (error) {
        console.error("[retriever] Keyword search error:", error);
        throw error;
    }
    return data || [];
}

/**
 * Performs a hybrid search (vector + keyword) and fuses results using Reciprocal Rank Fusion (RRF).
 */
export async function hybridSearch(query: string, limit: number = 10, specFilter?: string): Promise<{ results: RetrievalResult[], unresolvedRefs: { specId: string, clauseNumber: string }[] }> {
    const acronyms = await loadAcronyms(specFilter ? [specFilter] : undefined);
    const expandedQuery = expandQuery(query, acronyms);

    if (expandedQuery !== query) {
        console.log(`[retriever] Query expanded: "${expandedQuery}"`);
    }

    console.log(`[retriever] Getting embedding for query: "${expandedQuery}"`);
    const embedding = await getQueryEmbedding(expandedQuery);

    console.log(`[retriever] Fetching latest versions...`);
    const latestVersions = await getLatestVersions(specFilter ? [specFilter] : undefined);
    const targetVersion = specFilter ? latestVersions.get(specFilter) : undefined;

    console.log(`[retriever] Running vector and keyword search concurrently...`);
    // Retrieve a larger candidate pool before fusing
    const CANDIDATE_LIMIT = 50; // Increased to ensure we still have enough after in-memory filtering
    const [vectorResults, keywordResults] = await Promise.all([
        vectorSearch(embedding, CANDIDATE_LIMIT, specFilter, targetVersion),
        keywordSearch(expandedQuery, CANDIDATE_LIMIT, specFilter, targetVersion)
    ]);

    // In-memory filter for latest versions (vital if specFilter was not provided)
    const filterLatest = (results: any[]) => {
        return results.filter(chunk => chunk.spec_version === latestVersions.get(chunk.spec_id));
    };

    const latestVectorResults = filterLatest(vectorResults);
    const latestKeywordResults = filterLatest(keywordResults);

    console.log(`[retriever] Found ${latestVectorResults.length} vector hits, ${latestKeywordResults.length} keyword hits (after version filter).`);

    // Reciprocal Rank Fusion
    const RRF_K = 60;
    const scores = new Map<string, number>();
    const chunks = new Map<string, any>();

    // Score vector results
    latestVectorResults.forEach((chunk, index) => {
        const rank = index + 1;
        const score = 1 / (RRF_K + rank);
        scores.set(chunk.id, score);
        chunks.set(chunk.id, chunk);
    });

    // Score keyword results
    latestKeywordResults.forEach((chunk, index) => {
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
                spec_version: chunk.spec_version,
                clause_number: chunk.clause_number,
                clause_title: chunk.clause_title,
                page_number: chunk.page_number,
                chunk_index: chunk.chunk_index,
                text: chunk.text,
                score
            };
        })
        .sort((a, b) => b.score - a.score);

    console.log(`[retriever] Top RRF score before rerank: ${fusedResults[0]?.score?.toFixed(4)}`);

    // Rerank top results
    const topCandidatesForRerank = fusedResults.slice(0, 30);
    const rerankCandidates = topCandidatesForRerank.map(c => ({
        chunkId: c.id,
        text: c.text,
        originalResult: c
    }));

    console.log(`[retriever] Reranking top ${rerankCandidates.length} candidates...`);
    const reranked = await rerank(expandedQuery, rerankCandidates, limit);

    console.log(`[retriever] Expanding references from top chunks...`);
    const topChunkIds = reranked.map(r => (r as any).originalResult.id);
    const expandedRefs = await expandReferences(topChunkIds, 5);

    const resolvedExtraChunks = expandedRefs.filter(r => r.resolved).map(r => r.chunk);
    const unresolvedRefs = expandedRefs.filter(r => !r.resolved).map(r => ({ specId: r.referencedSpecId, clauseNumber: r.referencedClauseNumber || "" }));

    // Format the resolved chunks as RetrievalResult
    const extraResults: RetrievalResult[] = resolvedExtraChunks.map(chunk => ({
        id: chunk.id,
        spec_id: chunk.spec_id,
        release: chunk.release,
        spec_version: chunk.spec_version,
        clause_number: chunk.clause_number,
        clause_title: chunk.clause_title,
        page_number: chunk.page_number,
        chunk_index: chunk.chunk_index,
        text: chunk.text,
        score: 0 // They weren't matched by the query, just referenced
    }));

    // Dedupe
    const seenIds = new Set(reranked.map(r => (r as any).originalResult.id));
    const dedupedExtras = extraResults.filter(r => !seenIds.has(r.id));

    const finalResults = reranked.map(r => {
        const original = (r as any).originalResult as RetrievalResult;
        original.score = r.rerankScore;
        return original;
    });

    // Append the extras to the end
    finalResults.push(...dedupedExtras);

    console.log(`[retriever] Top Reranker score: ${finalResults[0]?.score?.toFixed(4)}`);
    return { results: finalResults, unresolvedRefs };
}
