import path from "path";
import { parsePdf } from "../src/services/pdfParser";
import { detectClauses, chunkClauses } from "../src/services/chunker";
import { embedTexts } from "../src/services/embedder";
import { upsertChunks } from "../src/services/upsertChunks";

async function main() {
    const [, , pdfPath, specId, release] = process.argv;
    if (!pdfPath || !specId || !release) {
        console.error("Usage: ts-node ingest.ts <pdf-path> <spec-id> <release>");
        process.exit(1);
    }

    console.log(`Parsing ${pdfPath}...`);
    const pages = await parsePdf(pdfPath);
    console.log(`Parsed ${pages.length} pages`);

    const clauses = detectClauses(pages);
    console.log(`Detected ${clauses.length} clauses`);

    const chunks = chunkClauses(clauses);
    console.log(`Built ${chunks.length} chunks`);

    const avgLen = chunks.reduce((s, c) => s + c.charCount, 0) / chunks.length;
    console.log(`Avg chunk length: ${avgLen.toFixed(0)} chars`);

    console.log("Embedding chunks...");
    const embeddings = await embedTexts(chunks.map((c) => c.text));

    console.log("Upserting to Supabase...");
    await upsertChunks(chunks, embeddings, specId, release);

    console.log("Done.");
}

main().catch((err) => {
    console.error("Ingestion failed:", err);
    process.exit(1);
});