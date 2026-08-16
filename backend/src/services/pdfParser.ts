import fs from "fs";
import path from "path";

// pdf-parse v1 exports a single async function (CJS)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse") as (
    buffer: Buffer,
    options?: Record<string, unknown>
) => Promise<{ numpages: number; text: string; info: Record<string, unknown> }>;

export interface ParsedPage {
    pageNumber: number;
    text: string;
}

// Patterns to strip from 3GPP spec pages:
//   "3GPP TS 23.501 version 17.9.0 Release 17"
//   "ETSI TS 123 501 V17.9.0 (2023-09)"
//   Standalone bare page numbers on their own line
const BOILERPLATE_RE =
    /^(?:\s*3GPP\s+(?:TS|TR)\s+[\d.]+[^\n]*|\s*ETSI\s+(?:TS|TR)\s+[\d ]+\s+V[\d.]+[^\n]*|\s*Release\s+\d+\s*|\s*\d{1,4}\s*)$/gim;

function cleanText(raw: string): string {
    return raw
        .replace(BOILERPLATE_RE, "")
        .replace(/\n{3,}/g, "\n\n")
        // Fix spaced-out acronyms from PDF OCR: "g N B" → "gNB", "A M F" → "AMF"
        // Matches 2-4 single uppercase letters separated by single spaces
        .replace(/\b([A-Z]) ([A-Z]) ([A-Z]) ([A-Z])\b/g, "$1$2$3$4")
        .replace(/\b([A-Z]) ([A-Z]) ([A-Z])\b/g, "$1$2$3")
        .replace(/\b([A-Z]) ([A-Z])\b/g, "$1$2")
        .trim();
}

export async function parsePdf(filePath: string): Promise<ParsedPage[]> {
    const absPath = path.resolve(filePath);
    const buffer = fs.readFileSync(absPath);
    const pages: ParsedPage[] = [];

    // pdf-parse v1: pagerender callback gives us per-page text
    const options = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pagerender(pageData: any): Promise<string> {
            return pageData.getTextContent({ normalizeWhitespace: true }).then((content: any) => {
                // Join text items — items with hasEOL=true get a newline, others a space
                let text = "";
                for (const item of content.items) {
                    text += item.str;
                    if (item.hasEOL) text += "\n";
                    else text += " ";
                }
                const cleaned = cleanText(text);
                pages.push({ pageNumber: pages.length + 1, text: cleaned });
                return cleaned;
            });
        },
    };

    await pdfParse(buffer, options);

    // Fallback: if pagerender produced nothing, split by form-feed
    if (pages.length === 0) {
        console.warn("[pdfParser] pagerender produced no pages; using form-feed split fallback");
        const result = await pdfParse(buffer);
        result.text.split("\f").forEach((rawText, i) => {
            const cleaned = cleanText(rawText);
            if (cleaned.length > 20) {
                pages.push({ pageNumber: i + 1, text: cleaned });
            }
        });
    }

    console.log(`[pdfParser] Extracted ${pages.length} pages from ${path.basename(absPath)}`);
    return pages.filter(p => p.text.length > 20);
}