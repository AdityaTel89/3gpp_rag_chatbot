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

// ---------------------------------------------------------------------------
// Clause heading detection
// ---------------------------------------------------------------------------
// 3GPP PDFs (extracted via pdf-parse pagerender) produce flat text where
// headings appear like:   "4.2.1   Architecture reference model"
// (multi-space gap between number and title).
//
// Pattern: N[.N]* followed by 2-6 spaces then a title (letters, no dots to
// avoid ToC lines), then either 3+ spaces (next heading) or end of match.
const CLAUSE_HEADING_RE =
    /(\d{1,2}(?:\.\d{1,2}){0,3})\s{2,6}([A-Za-z][^.\n]{2,80}?)(?=\s{3,}|\s+\d{1,2}(?:\.\d+)+\s{2,}|$)/g;

// Known false-positive clause numbers (bare page numbers, release numbers)
const FALSE_POSITIVE_TITLES = new Set(["Release 17", "Release 16", "Release 15"]);

// Matches version strings used as "clause numbers" in 3GPP change-history tables:
// e.g. "15.4.0", "16.2.0", "17.1.0" — format: NN.N.N or NN.NN.N
const VERSION_STRING_RE = /^\d{2}\.\d{1,2}\.\d+$/;

/**
 * Clean OCR artifacts from a clause title extracted by the regex.
 * e.g. "R eference s" → "References", "A bb reviations" → "Abbreviations"
 */
function cleanTitle(raw: string): string {
    return raw
        // Fix spaced uppercase acronyms: "N G - R A N" → "NG-RAN"
        .replace(/\b([A-Z]) ([A-Z]) ([A-Z]) ([A-Z])\b/g, "$1$2$3$4")
        .replace(/\b([A-Z]) ([A-Z]) ([A-Z])\b/g, "$1$2$3")
        .replace(/\b([A-Z]) ([A-Z])\b/g, "$1$2")
        // Remove mid-word spaces from common OCR splits: "R eference" → "Reference"
        .replace(/\b([A-Za-z]{1,3}) ([a-z]{2,})/g, "$1$2")
        .trim();
}

// Title is a false positive if it's just digits/spaces or a very common word
function isFalsePositive(clauseNumber: string, title: string): boolean {
    if (FALSE_POSITIVE_TITLES.has(title)) return true;
    if (/^[\d\s]+$/.test(title)) return true;
    if (title.length < 4) return true;
    // Single capital letter followed by digits (like "N 2", "N 1" — reference labels)
    if (/^[A-Z]\s+\d+/.test(title)) return true;
    // Reject version-string clause numbers from 3GPP change-history tables (e.g. "15.4.0")
    if (VERSION_STRING_RE.test(clauseNumber)) return true;
    // Reject document status / version-header sentences (not normative content)
    const titleLower = title.toLowerCase();
    if (titleLower.includes("presented to tsg") || titleLower.includes("tsg approved") ||
        titleLower.includes("change control") || titleLower.includes("incremented for all")) return true;
    // Clause number that's just a page number (two-digit, matching 1-600)
    const num = parseInt(clauseNumber, 10);
    if (!clauseNumber.includes(".") && num >= 1 && num <= 600) {
        // Only keep if title looks like a real section title (more than 1 word)
        const words = title.trim().split(/\s+/);
        if (words.length < 2) return true;
    }
    return false;
}

export function detectClauses(pages: ParsedPage[]): Clause[] {
    const clauses: Clause[] = [];

    for (const page of pages) {
        const text = page.text;

        // Skip 3GPP change-history table pages (high density of "RP-XXXXXX" reference IDs)
        // These pages appear at the end of the spec and contain no normative content.
        const rpPatternCount = (text.match(/RP\s*-\s*\d{5,6}/g) ?? []).length;
        if (rpPatternCount > 5) continue;

        // Skip clearly ToC pages (very high density of dots from "......." leaders)
        const consecutiveDots = (text.match(/\.{4,}/g) ?? []).length;
        if (consecutiveDots > 3) continue;

        let match: RegExpExecArray | null;
        CLAUSE_HEADING_RE.lastIndex = 0;

        while ((match = CLAUSE_HEADING_RE.exec(text)) !== null) {
            const clauseNumber = match[1];
            const rawTitle = cleanTitle(match[2].trim());

            if (isFalsePositive(clauseNumber, rawTitle)) continue;

            // Get the text after this heading until the next heading or end
            const headingEnd = match.index + match[0].length;
            const sectionText = text.slice(headingEnd, headingEnd + 4000).trim();

            if (sectionText.length < 30) continue;

            clauses.push({
                clauseNumber,
                clauseTitle: rawTitle,
                startPage: page.pageNumber,
                text: sectionText,
            });
        }
    }

    return clauses;
}

// ---------------------------------------------------------------------------
// Chunker
// ---------------------------------------------------------------------------

const TARGET_CHUNK_CHARS = 1800;   // ~300–500 tokens for MiniLM
const OVERLAP_CHARS       = 150;

export function chunkClauses(clauses: Clause[]): Chunk[] {
    const chunks: Chunk[] = [];

    for (const clause of clauses) {
        const sentences = clause.text.split(/(?<=[.!?])\s+/);
        let buffer = "";
        let chunkIndex = 0;
        let overlap = "";

        for (const sentence of sentences) {
            if (buffer.length > 0 && (buffer + sentence).length > TARGET_CHUNK_CHARS) {
                chunks.push(makeChunk(clause, overlap + buffer, chunkIndex++));
                overlap = buffer.slice(-OVERLAP_CHARS);
                buffer = sentence + " ";
            } else {
                buffer += sentence + " ";
            }
        }

        if (buffer.trim().length > 30) {
            chunks.push(makeChunk(clause, overlap + buffer, chunkIndex++));
        }
    }

    return chunks;
}

function makeChunk(clause: Clause, text: string, chunkIndex: number): Chunk {
    const cleaned = text.trim();
    return {
        clauseNumber: clause.clauseNumber,
        clauseTitle: clause.clauseTitle,
        pageNumber: clause.startPage,
        chunkIndex,
        text: cleaned,
        charCount: cleaned.length,
    };
}