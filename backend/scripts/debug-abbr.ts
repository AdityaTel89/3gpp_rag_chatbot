import { parsePdf } from "../src/services/pdfParser";
import { detectClauses } from "../src/services/chunker";
import path from "path";

async function main() {
    const absPath = path.resolve("../data/raw/TS23501.pdf");
    const pages = await parsePdf(absPath);
    const clauses = detectClauses(pages);
    
    for (const clause of clauses) {
        if (/abbreviation/i.test(clause.clauseTitle)) {
            console.log(`Found clause: ${clause.clauseNumber} - ${clause.clauseTitle}`);
            console.log("First 300 chars:");
            console.log(clause.text.substring(0, 300));
            
            console.log("\nTrying regex:");
            const pattern = /^([A-Z0-9\-]{2,10})\s+(.+)$/gm;
            let match;
            let count = 0;
            while ((match = pattern.exec(clause.text)) !== null) {
                console.log(`Match: [${match[1]}] -> [${match[2]}]`);
                count++;
                if (count > 5) break;
            }
            console.log(`Total matched: ${count}`);
        }
    }
}

main().catch(console.error);
