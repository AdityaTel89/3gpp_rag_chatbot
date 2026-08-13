import fs from "fs";

const pdf = require("pdf-parse");
export interface ParsedPage {
    pageNumber: number;
    text: string;
}

export async function parsePdf(filePath: string): Promise<ParsedPage[]> {
    const buffer = fs.readFileSync(filePath);
    const pages: ParsedPage[] = [];

    await pdf(buffer, {
        pagerender: (pageData: any) => {
            return pageData.getTextContent().then((textContent: any) => {
                const text = textContent.items.map((item: any) => item.str).join(" ");
                pages.push({ pageNumber: pages.length + 1, text });
                return text;
            });
        },
    });

    return pages;
}