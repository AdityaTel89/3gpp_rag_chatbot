import path from "path";
import dotenv from "dotenv";

// Load .env from backend/ directory
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { parsePdf } from "../src/services/pdfParser";
import { detectClauses, chunkClauses, Chunk } from "../src/services/chunker";
import { embedTexts } from "../src/services/embedder";
import { upsertChunks } from "../src/services/upsertChunks";

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

// If not specified via flags, extract non-flag positional arguments
if (!pdfPath || !specId || !release) {
    const positional: string[] = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--dry-run") continue;
        if (args[i] === "--inspect" || args[i] === "--pdf" || args[i] === "--spec" || args[i] === "--release") {
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
}

async function main() {
    if (!pdfPath || !specId || !release) {
        console.error("Usage: ts-node scripts/ingest.ts --pdf <pdf-path> --spec <spec-id> --release <release> [--dry-run] [--inspect N]");
        console.error("Example: ts-node scripts/ingest.ts --pdf data/raw/TS23501.pdf --spec \"TS 23.501\" --release \"Rel-17\" --dry-run --inspect 5");
        process.exit(1);
    }

    const absPath = path.resolve(pdfPath);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Ingesting: ${absPath}`);
    console.log(`Spec ID:   ${specId}  |  Release: ${release}`);
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

    // ---- Step 4: Embed ----
    console.log("\n[4/5] Generating embeddings...");
    const t1 = Date.now();
    const embeddings = await embedTexts(chunks.map(c => c.text));
    console.log(`      ✓ Embedded ${embeddings.length} chunks in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

    // ---- Step 5: Upsert ----
    console.log("\n[5/5] Upserting to Supabase...");
    const t2 = Date.now();
    await upsertChunks(chunks, embeddings, specId, release);
    console.log(`      ✓ Upserted in ${((Date.now() - t2) / 1000).toFixed(1)}s`);

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