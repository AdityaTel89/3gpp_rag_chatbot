import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { supabase } from "../src/services/supabaseClient";

async function main() {
    console.log("============================================================");
    console.log("             SUPABASE INGESTION SPOT-CHECK                  ");
    console.log("============================================================\n");

    // 1. Total row count & per-spec row counts
    console.log("[1] Checking Row Counts per Spec...");

    // Clean up any accidental stray records from earlier tests
    await supabase.from("spec_chunks").delete().eq("spec_id", "TS");

    // Fetch distinct specs
    const { data: distinctSpecs } = await supabase
        .from("spec_chunks")
        .select("spec_id, release");

    const specMap: Record<string, string> = {};
    for (const row of distinctSpecs || []) {
        specMap[row.spec_id] = row.release;
    }

    const { count: totalCount } = await supabase
        .from("spec_chunks")
        .select("*", { count: "exact", head: true });

    console.log(`   Total Chunks in DB: ${totalCount ?? 0}`);
    for (const [spec, release] of Object.entries(specMap)) {
        const { count: specCount } = await supabase
            .from("spec_chunks")
            .select("*", { count: "exact", head: true })
            .eq("spec_id", spec);
        console.log(`   • ${spec} (${release}): ${specCount ?? 0} chunks`);
    }

    if (Object.keys(specMap).length === 0) {
        console.warn("\n⚠️  No chunks found in 'spec_chunks'. Run ingestion first!");
        return;
    }

    // 2. Check Embedding non-null & Dimensions
    console.log("\n[2] Checking Embeddings (vector column)...");
    const { data: sampleEmbeddings, error: embErr } = await supabase
        .from("spec_chunks")
        .select("id, spec_id, clause_number, embedding")
        .limit(5);

    if (embErr) {
        console.error("❌ Error checking embeddings:", embErr.message);
    } else {
        const allNonNull = sampleEmbeddings.every(r => r.embedding !== null);
        console.log(`   • Sample embedding non-null: ${allNonNull ? "✅ YES (all non-null)" : "❌ NO"}`);
        if (sampleEmbeddings.length > 0 && sampleEmbeddings[0].embedding) {
            // Note: pgvector returns either an array of numbers or a string vector format depending on client
            const emb = sampleEmbeddings[0].embedding;
            const dim = Array.isArray(emb) ? emb.length : (typeof emb === "string" ? emb.split(",").length : "valid");
            console.log(`   • Embedding dimension: ${dim} (expected 384)`);
        }
    }

    // 3. Check Full-Text Search (fts column)
    console.log("\n[3] Checking Postgres Full-Text Search (fts column)...");
    const { data: ftsSample, error: ftsErr } = await supabase
        .from("spec_chunks")
        .select("id, spec_id, clause_number, fts")
        .limit(3);

    if (ftsErr) {
        console.error("❌ Error checking fts:", ftsErr.message);
    } else {
        const ftsPopulated = ftsSample.every(r => r.fts !== null && String(r.fts).length > 0);
        console.log(`   • FTS auto-generation: ${ftsPopulated ? "✅ POPULATED" : "⚠️ EMPTY/NULL"}`);
    }

    // 4. Sample Clause Boundaries & Metadata Inspection
    console.log("\n[4] Inspecting Sample Chunks & Clause Boundaries...");
    const { data: samples, error: sampleErr } = await supabase
        .from("spec_chunks")
        .select("spec_id, release, clause_number, clause_title, page_number, chunk_index, char_count, text")
        .limit(3);

    if (sampleErr) {
        console.error("❌ Error fetching samples:", sampleErr.message);
    } else {
        samples.forEach((chunk, i) => {
            console.log(`\n--- Sample Chunk #${i + 1} ---`);
            console.log(`  Spec:        ${chunk.spec_id} (${chunk.release})`);
            console.log(`  Clause:      ${chunk.clause_number} — "${chunk.clause_title}"`);
            console.log(`  Page Number: ${chunk.page_number} | Chunk Index: ${chunk.chunk_index}`);
            console.log(`  Char Count:  ${chunk.char_count} chars`);
            console.log(`  Snippet:     "${chunk.text.slice(0, 180).replace(/\n/g, " ")}..."`);
        });
    }

    // 5. Keyword search test (FTS test query)
    console.log("\n[5] Testing Keyword / Full-Text Search Query...");
    const testQuery = "RRC connection establishment";
    const { data: searchResults, error: searchErr } = await supabase
        .from("spec_chunks")
        .select("spec_id, clause_number, clause_title, page_number")
        .textSearch("fts", testQuery, { type: "websearch" })
        .limit(3);

    if (searchErr) {
        console.error("❌ Keyword search test failed:", searchErr.message);
    } else {
        console.log(`   Query: "${testQuery}"`);
        console.log(`   Matches found: ${searchResults.length}`);
        searchResults.forEach((r, idx) => {
            console.log(`   ${idx + 1}. [${r.spec_id}] Clause ${r.clause_number} — ${r.clause_title} (Page ${r.page_number})`);
        });
    }

    console.log("\n============================================================");
    console.log("                  SPOT-CHECK SUMMARY                        ");
    console.log("============================================================\n");
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
