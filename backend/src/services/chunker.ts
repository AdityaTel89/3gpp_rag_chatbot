import { ParsedPage } from "./pdfParser";

export interface Clause {
    clauseNumber: string;
    clauseTitle: string;
    startPage: number;
    text: string;
}

export interface Chunk {
    clauseNumber: string;
    clauseTitle: string;
    pageNumber: number;
    chunkIndex: number;
    text: string;
    charCount: number;
}

// Matches headings like "6.3.2 RRC connection establishment"
// Numbered 1–3 levels deep is typical for 3GPP; adjust if you see 4-level clauses.
const CLAUSE_HEADING_RE = /^(\d{1,2}(?:\.\d{1,2}){0,3})\s+([A-Z][^\n]{2,100})$/m;

export function detectClauses(pages: ParsedPage[]): Clause[] {
    const fullText = pages.map((p) => `[[PAGE:${p.pageNumber}]] ${p.text}`).join("\n");
    const lines = fullText.split(/(?=\[\[PAGE:)/); // rough page-aware split; refine after first real run

    const clauses: Clause[] = [];
    let current: Clause | null = null;

    // NOTE: this is a first-pass heuristic. Expect to iterate on CLAUSE_HEADING_RE
    // after seeing real false positives/negatives on TS 38.300 (e.g. it may catch
    // table row numbers or figure captions — tighten the regex against the actual
    // extracted text before trusting the output).
    for (const line of lines) {
        const match = line.match(CLAUSE_HEADING_RE);
        if (match) {
            if (current) clauses.push(current);
            current = {
                clauseNumber: match[1],
                clauseTitle: match[2].trim(),
                startPage: extractPageNumber(line),
                text: "",
            };
        }
        if (current) current.text += line + "\n";
    }
    if (current) clauses.push(current);
    return clauses;
}

function extractPageNumber(line: string): number {
    const m = line.match(/\[\[PAGE:(\d+)\]\]/);
    return m ? parseInt(m[1], 10) : 0;
}

const TARGET_CHUNK_CHARS = 1800; // ~300-500 tokens

export function chunkClauses(clauses: Clause[]): Chunk[] {
    const chunks: Chunk[] = [];

    for (const clause of clauses) {
        const sentences = clause.text.split(/(?<=[.!?])\s+/);
        let buffer = "";
        let chunkIndex = 0;

        for (const sentence of sentences) {
            if ((buffer + sentence).length > TARGET_CHUNK_CHARS && buffer.length > 0) {
                chunks.push(makeChunk(clause, buffer, chunkIndex++));
                buffer = "";
            }
            buffer += sentence + " ";
        }
        if (buffer.trim().length > 0) {
            chunks.push(makeChunk(clause, buffer, chunkIndex++));
        }
    }

    return chunks;
}

function makeChunk(clause: Clause, text: string, chunkIndex: number): Chunk {
    const trimmed = text.trim();
    return {
        clauseNumber: clause.clauseNumber,
        clauseTitle: clause.clauseTitle,
        pageNumber: clause.startPage,
        chunkIndex,
        text: trimmed,
        charCount: trimmed.length,
    };
}