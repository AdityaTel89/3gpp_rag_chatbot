import { supabase } from "./supabaseClient";
import { Chunk } from "./chunker";

const BATCH_SIZE = 50;
const MAX_RETRIES = 5;

export async function upsertChunks(
    chunks: Chunk[],
    embeddings: number[][],
    specId: string,
    release: string,
    specVersion: string
) {
    // 1. Clear any existing chunks for this spec to prevent duplicates on re-ingestion
    console.log(`[upsertChunks] Removing any existing chunks for spec "${specId}" version "${specVersion}"...`);
    const { error: deleteError } = await supabase
        .from("spec_chunks")
        .delete()
        .eq("spec_id", specId)
        .eq("spec_version", specVersion);

    if (deleteError) {
        console.warn(`[upsertChunks] Warning while clearing existing spec chunks: ${deleteError.message}`);
    }

    // 2. Prepare payload
    const rows = chunks.map((chunk, i) => ({
        spec_id: specId,
        release,
        spec_version: specVersion,
        clause_number: chunk.clauseNumber,
        clause_title: chunk.clauseTitle,
        page_number: chunk.pageNumber,
        chunk_index: chunk.chunkIndex,
        text: chunk.text,
        char_count: chunk.charCount,
        embedding: JSON.stringify(embeddings[i]),
    }));

    let inserted = 0;
    const allInserted: { id: string; text: string }[] = [];

    // 3. Insert in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        let lastError: any = null;
        let batchInserted: any = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const { data, error } = await supabase
                .from("spec_chunks")
                .insert(batch)
                .select("id, text");

            if (!error) {
                lastError = null;
                batchInserted = data;
                break;
            }
            lastError = error;
            if (attempt < MAX_RETRIES) {
                console.warn(`[upsertChunks] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (attempt ${attempt}): ${error.message}. Retrying in ${attempt}s...`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }

        if (lastError) throw lastError;
        
        if (batchInserted) {
            allInserted.push(...batchInserted);
        }

        inserted += batch.length;
        console.log(`[upsertChunks] Inserted ${inserted}/${rows.length} rows`);
    }
    
    return allInserted;
}