import path from "path";
import dotenv from "dotenv";

// Load .env from backend/ directory
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { parsePdf } from "../src/services/pdfParser";
import { detectClauses, chunkClauses, Chunk } from "../src/services/chunker";
import { embedTexts } from "../src/services/embedder";
import { upsertChunks } from "../src/services/upsertChunks";
import { upsertAcronyms } from "../src/services/upsertAcronyms";
import { supabase } from "../src/services/supabaseClient";

// CLI flags & Argument Parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN     = args.includes("--dry-run");
const INSPECT_IDX = args.indexOf("--inspect");
const INSPECT_N   = INSPECT_IDX !== -1 ? parseInt(args[INSPECT_IDX + 1] ?? "5", 10) : 0;

function cleanArg(str: string | undefined): string {
    if (!str) return "";
    return str.replace(/^["']+|["']+$/g, "").replace(/^\\+|\\+$/g, "").trim();
}

function getFlagValue(flag: string): string {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
        return cleanArg(args[idx + 1]);
    }
    return "";
}

let pdfPath = getFlagValue("--pdf");
let specId  = getFlagValue("--spec");
let release = getFlagValue("--release");
let specVersion = getFlagValue("--version");

// If not specified via flags, extract non-flag positional arguments
if (!pdfPath || !specId || !release || !specVersion) {
    const positional: string[] = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--dry-run") continue;
        if (args[i] === "--inspect" || args[i] === "--pdf" || args[i] === "--spec" || args[i] === "--release" || args[i] === "--version") {
            i++; // skip flag value
            continue;
        }
        if (args[i].startsWith("--")) continue;
        const cleaned = cleanArg(args[i]);
        if (cleaned) positional.push(cleaned);
    }
    if (!pdfPath && positional[0]) pdfPath = positional[0];
    if (!specId && positional[1]) specId = positional[1];
    if (!release && positional[2]) release = positional[2];
    if (!specVersion && positional[3]) specVersion = positional[3];
}

async function main() {
    if (!pdfPath || !specId || !release || !specVersion) {
        console.error("Usage: ts-node scripts/ingest.ts --pdf <pdf-path> --spec <spec-id> --release <release> --version <version> [--dry-run] [--inspect N]");
        console.error("Example: ts-node scripts/ingest.ts --pdf data/raw/TS23501.pdf --spec \"TS 23.501\" --release \"Rel-17\" --version \"17.4.0\" --dry-run --inspect 5");
        process.exit(1);
    }

    const absPath = path.resolve(pdfPath);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Ingesting: ${absPath}`);
    console.log(`Spec ID:   ${specId}  |  Release: ${release}  |  Version: ${specVersion}`);
    console.log(`Mode:      ${DRY_RUN ? "DRY RUN (no DB writes)" : "FULL INGEST"}`);
    console.log("=".repeat(60) + "\n");

    // ---- Step 1: Parse PDF ----
    console.log("[1/5] Parsing PDF...");
    const t0 = Date.now();
    const pages = await parsePdf(absPath);
    console.log(`      ✓ Parsed ${pages.length} pages in ${Date.now() - t0}ms`);

    const totalChars = pages.reduce((s, p) => s + p.text.length, 0);
    console.log(`      ✓ Total text: ${(totalChars / 1000).toFixed(1)}K chars`);

    // ---- Step 2: Detect clauses ----
    console.log("\n[2/5] Detecting clause structure...");
    const clauses = detectClauses(pages);
    console.log(`      ✓ Detected ${clauses.length} clauses`);

    if (clauses.length === 0) {
        console.warn("⚠️  WARNING: 0 clauses detected — clause regex may not match this PDF's heading format.");
        console.warn("   Check the first few pages of the PDF and inspect the text output.");
        process.exit(1);
    }

    // ---- Step 2.5: Extract Acronyms ----
    console.log("\n[2.5/5] Extracting acronyms...");
    const acronyms: { specId: string; acronym: string; expansion: string }[] = [];
    for (const clause of clauses) {
        if (/abbreviation|definition/i.test(clause.clauseTitle)) {
            console.log(`      > Scanning clause: ${clause.clauseNumber} - ${clause.clauseTitle}`);
            // More lenient regex: allows leading spaces, lowercase letters, and longer acronyms
            const pattern = /^\s*([A-Za-z0-9\-]{2,15})[\s\t]+(.+)$/gm;
            let match;
            let matchCount = 0;
            while ((match = pattern.exec(clause.text)) !== null) {
                // Filter out common false positives (e.g. single words, or lines that are too long)
                if (match[2].trim().length > 100) continue;
                
                acronyms.push({
                    specId,
                    acronym: match[1],
                    expansion: match[2].trim()
                });
                matchCount++;
            }
            console.log(`      > Found ${matchCount} acronyms in this clause.`);
        }
    }
    console.log(`      ✓ Extracted ${acronyms.length} total acronyms`);
    if (!DRY_RUN && acronyms.length > 0) {
        await upsertAcronyms(acronyms);
    }

    // ---- Step 3: Chunk ----
    console.log("\n[3/5] Chunking clauses...");
    const chunks: Chunk[] = chunkClauses(clauses);
    console.log(`      ✓ Built ${chunks.length} chunks`);

    // Compute stats
    const charCounts = chunks.map(c => c.charCount);
    const avgLen  = charCounts.reduce((a, b) => a + b, 0) / chunks.length;
    const minLen  = Math.min(...charCounts);
    const maxLen  = Math.max(...charCounts);
    const tinyChunks = chunks.filter(c => c.charCount < 50).length;
    console.log(`      ✓ Avg: ${avgLen.toFixed(0)} chars | Min: ${minLen} | Max: ${maxLen}`);
    if (tinyChunks > 0) console.warn(`      ⚠️  ${tinyChunks} chunks < 50 chars (likely noise)`);

    // ---- Inspect mode ----
    if (INSPECT_N > 0) {
        console.log(`\n--- Inspecting first ${Math.min(INSPECT_N, chunks.length)} chunks ---`);
        for (let i = 0; i < Math.min(INSPECT_N, chunks.length); i++) {
            const c = chunks[i];
            console.log(`\nChunk #${i + 1}`);
            console.log(`  Clause: ${c.clauseNumber} — ${c.clauseTitle}`);
            console.log(`  Page:   ${c.pageNumber}  |  Index: ${c.chunkIndex}  |  Chars: ${c.charCount}`);
            console.log(`  Text:   ${c.text.slice(0, 200).replace(/\n/g, " ")}...`);
        }
        console.log("\n--- End inspection ---\n");
    }

    if (DRY_RUN) {
        console.log("\n✅ Dry run complete — no embeddings generated and no DB writes.\n");
        return;
    }

    // ---- Step 3.5: Version Conflict Check ----
    console.log("\n[3.5/5] Checking for version conflicts...");
    const { data: existingData } = await supabase
        .from('spec_chunks')
        .select('clause_number, chunk_index, text, spec_version')
        .eq('spec_id', specId)
        .eq('release', release);

    if (existingData && existingData.length > 0) {
        let conflictCount = 0;
        for (const chunk of chunks) {
            const conflicting = existingData.filter(r => r.clause_number === chunk.clauseNumber && r.chunk_index === chunk.chunkIndex && r.text !== chunk.text);
            if (conflicting.length > 0) {
                console.warn(
                    `      ⚠️  Conflict: Clause ${chunk.clauseNumber} chunk ${chunk.chunkIndex} already indexed ` +
                    `with different text under version(s): ${conflicting.map(c => c.spec_version).join(', ')}`
                );
                conflictCount++;
            }
        }
        if (conflictCount > 0) {
            console.warn(`      ⚠️  Found ${conflictCount} version conflicts. Proceeding with ingestion of version ${specVersion}...`);
        } else {
            console.log(`      ✓ No text conflicts found across different versions.`);
        }
    } else {
        console.log(`      ✓ No previous versions of this spec indexed.`);
    }

    // ---- Step 4: Embed ----
    console.log("\n[4/5] Generating embeddings...");
    const t1 = Date.now();
    const embeddings = await embedTexts(chunks.map(c => c.text));
    console.log(`      ✓ Embedded ${embeddings.length} chunks in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

    // ---- Step 5: Upsert ----
    console.log("\n[5/6] Upserting to Supabase...");
    const t2 = Date.now();
    const insertedChunks = await upsertChunks(chunks, embeddings, specId, release, specVersion);
    console.log(`      ✓ Upserted in ${((Date.now() - t2) / 1000).toFixed(1)}s`);

    // ---- Step 6: Extract & Insert References ----
    console.log("\n[6/6] Extracting cross-references...");
    function extractReferences(chunkText: string, defaultSpecId: string): { specId: string; clauseNumber: string }[] {
        const refs: { specId: string; clauseNumber: string }[] = [];
        
        // Pattern 1: "see clause 5.3.4" / "clause 5.3.4" (same spec)
        const sameSpecPattern = /clause\s+(\d+(?:\.\d+)+)/gi;
        for (const m of chunkText.matchAll(sameSpecPattern)) {
            refs.push({ specId: defaultSpecId, clauseNumber: m[1] });
        }
        
        // Pattern 2: "TS 23.502 clause 4.3.2" (cross-spec). We discard references without a clause.
        const crossSpecPattern = /TS\s+(\d{2}\.\d{3})\s+clause\s+(\d+(?:\.\d+)+)/gi;
        for (const m of chunkText.matchAll(crossSpecPattern)) {
            refs.push({ specId: `TS ${m[1]}`, clauseNumber: m[2] });
        }
        return refs;
    }

    const refsToInsert = [];
    for (const chunk of insertedChunks) {
        const refs = extractReferences(chunk.text, specId);
        for (const ref of refs) {
            refsToInsert.push({
                source_chunk_id: chunk.id,
                referenced_spec_id: ref.specId,
                referenced_clause_number: ref.clauseNumber
            });
        }
    }

    if (refsToInsert.length > 0) {
        let refsInserted = 0;
        for (let i = 0; i < refsToInsert.length; i += 100) {
            const batch = refsToInsert.slice(i, i + 100);
            await supabase.from("clause_references").insert(batch);
            refsInserted += batch.length;
        }
        console.log(`      ✓ Extracted and inserted ${refsInserted} cross-references`);
    } else {
        console.log(`      ✓ No cross-references found`);
    }

    console.log(`\n✅ Ingestion complete!`);
    console.log(`   Spec:    ${specId}  (${release})`);
    console.log(`   Chunks:  ${chunks.length}`);
    console.log(`   Clauses: ${clauses.length}`);
    console.log(`   Pages:   ${pages.length}\n`);
}

main().catch(err => {
    console.error("\n❌ Ingestion failed:", err);
    process.exit(1);
});