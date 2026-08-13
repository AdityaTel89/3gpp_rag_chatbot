// backend/src/services/upsertChunks.ts
import { supabase } from "./supabaseClient";
import { Chunk } from "./chunker";

export async function upsertChunks(
    chunks: Chunk[],
    embeddings: number[][],
    specId: string,
    release: string
) {
    const rows = chunks.map((chunk, i) => ({
        spec_id: specId,
        release,
        clause_number: chunk.clauseNumber,
        clause_title: chunk.clauseTitle,
        page_number: chunk.pageNumber,
        chunk_index: chunk.chunkIndex,
        text: chunk.text,
        char_count: chunk.charCount,
        embedding: embeddings[i],
    }));

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from("spec_chunks").insert(batch);
        if (error) throw error;
        console.log(`Upserted ${i + batch.length}/${rows.length} chunks`);
    }
}