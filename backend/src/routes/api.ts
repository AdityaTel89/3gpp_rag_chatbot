import { Router, Request, Response } from "express";
import { supabase } from "../services/supabaseClient";
import { hybridSearch } from "../services/retriever";
import { generateAnswer } from "../services/llm";
import { verifyClaims } from "../services/groundingCheck";
import { SpecChunk, QueryResponse, Citation } from "../../../shared/types";

const router = Router();

// Liveness check
router.get("/health", async (req: Request, res: Response) => {
    try {
        // Quick DB check to ensure Supabase is reachable
        const { error } = await supabase.from("spec_chunks").select("id").limit(1);
        if (error) {
            throw error;
        }
        res.json({ status: "ok", db: "connected" });
    } catch (err: any) {
        console.error("[api/health] DB Error:", err.message);
        res.status(503).json({ status: "error", message: err.message });
    }
});

// List indexed specs
router.get("/specs", async (req: Request, res: Response) => {
    try {
        // Fast skip-scan across distinct spec_id entries using ordering and limit(1)
        const uniqueSpecs: Array<{ spec_id: string; release: string }> = [];
        let lastSpecId = "";

        while (true) {
            let query = supabase
                .from("spec_chunks")
                .select("spec_id, release")
                .order("spec_id", { ascending: true })
                .limit(1);

            if (lastSpecId) {
                query = query.gt("spec_id", lastSpecId);
            }

            const { data, error } = await query;
            if (error) throw error;
            if (!data || data.length === 0) break;

            uniqueSpecs.push({
                spec_id: data[0].spec_id,
                release: data[0].release
            });
            lastSpecId = data[0].spec_id;
        }

        res.json(uniqueSpecs);
    } catch (err: any) {
        console.error("[api/specs] Error:", err.message);
        res.status(500).json({ error: "Failed to fetch specs" });
    }
});

// ... existing code up to specs route ...

/**
 * Infers which spec to search based on vocabulary in the question.
 * Returns "TS 38.300" for RAN/radio-layer queries, "TS 23.501" for core-network queries,
 * or undefined (search both) for ambiguous queries.
 */
function inferSpecFilter(question: string): string | undefined {
    const q = question.toLowerCase();

    // TS 38.300 signals — RAN / radio / air-interface
    const ts38Signals = [
        "rrc", "ng-ran", "ngran", "gnb", "enb", "nr access", "pdcp sublayer",
        "rlc sublayer", "mac sublayer", "mac layer", "physical layer",
        "cu-cp", "cu-up", "centralized unit", "distributed unit",
        "en-dc", "dual connectivity", "xn interface", "f1 interface",
        "logical channel", "transport channel", "bearer channel",
        "handover procedure", "cell reselection", "beamforming",
        "rrc_idle", "rrc_inactive", "rrc_connected",
    ];

    // TS 23.501 signals — 5GC / core network
    const ts23Signals = [
        "amf", "smf", "upf", "pcf", "nrf", "ausf", "udm", "udr", "nssf",
        "pdu session", "network slice", "s-nssai", "nsi id", "nsi-id",
        "roaming", "lbo", "home-routed", "5gc", "n1 interface", "n2 interface",
        "5g core", "service based", "sbi",
    ];

    const has38 = ts38Signals.some(kw => q.includes(kw));
    const has23 = ts23Signals.some(kw => q.includes(kw));

    if (has38 && !has23) return "TS 38.300";
    if (has23 && !has38) return "TS 23.501";
    return undefined; // ambiguous — search both specs
}

// Full LLM Query Pipeline (Phase 3)
router.post("/query", async (req: Request, res: Response): Promise<any> => {
    try {
        const { question, spec_filter, limit = 10 } = req.body;
        if (!question || typeof question !== "string") {
            return res.status(400).json({ error: "Missing or invalid 'question' string in body" });
        }

        // 1. Hybrid Search
        // Use explicit spec_filter from request body, or infer from question vocabulary
        const effectiveSpecFilter = spec_filter || inferSpecFilter(question);
        if (effectiveSpecFilter && !spec_filter) {
            console.log(`[api/query] Inferred spec filter: ${effectiveSpecFilter}`);
        }
        const { results, unresolvedRefs } = await hybridSearch(question, limit, effectiveSpecFilter);

        // Map RetrievalResult to SpecChunk for shared types
        const chunks: SpecChunk[] = results.map(r => ({
            id: r.id,
            spec_id: r.spec_id,
            version: r.spec_version || r.release,
            clause_number: r.clause_number,
            clause_title: r.clause_title || "",
            page_number: r.page_number || 1,
            chunk_index: r.chunk_index,
            content: r.text
        }));

        // 2. Confidence Gate
        // bge-reranker-base outputs raw cross-encoder logits (unbounded, not 0-1).
        // We apply sigmoid so that logit=0 → 0.5, logit=-1 → ~0.27, logit=1 → ~0.73.
        // A sigmoid threshold of 0.2 (logit ≈ -1.4) lets through any chunks with a
        // weak-to-moderate relevance signal, while still blocking clearly irrelevant queries.
        const rawTopScore = results.length > 0 ? results[0].score : -Infinity;
        const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
        const topScore = sigmoid(rawTopScore);
        const confidenceThreshold = 0.35;  // Raised from 0.2 — reduces adversarial false positives
        const isConfident = topScore >= confidenceThreshold;

        // 3. Topic Consistency Check (keyword heuristic — covers both TS 23.501 and TS 38.300 topics)
        const telecomKeywords = [
            // General 5G / core
            "3gpp", "5g", "lte", "nr", "network", "ue", "amf", "smf", "upf", "pdu", "bearer",
            // RAN / radio
            "gnb", "enb", "rrc", "cell", "pdcp", "rlc", "mac", "phy",
            // NG-RAN architecture (TS 38.300 specific)
            "ng-ran", "ng_ran", "ngran", "cu", "du", "f1", "ngu", "xn", "en-dc", "endc",
            "dual connectivity", "carrier aggregation", "handover", "beamforming",
            "channel", "transport channel", "logical channel",
        ];
        const queryLower = question.toLowerCase();
        const isTopicConsistent = telecomKeywords.some(kw => queryLower.includes(kw));

        if (!isConfident || !isTopicConsistent || chunks.length === 0) {
            const response: QueryResponse = {
                answer: "I'm sorry, I cannot answer this question based on the provided 3GPP specifications.",
                citations: [],
                confidence: topScore, // We'll pass the raw score or normalized
                abstained: true,
                unresolvedReferences: unresolvedRefs
            };
            return res.json(response);
        }

        // 4. LLM Generation
        const llmResponse = await generateAnswer(question, chunks, unresolvedRefs);

        if (llmResponse.abstain || llmResponse.claims.length === 0) {
            const response: QueryResponse = {
                answer: "I'm sorry, I cannot answer this question based on the provided 3GPP specifications.",
                citations: [],
                confidence: topScore,
                abstained: true,
                unresolvedReferences: unresolvedRefs
            };
            return res.json(response);
        }

        // 5. Grounding Check
        const chunkMap = new Map<string, string>();
        chunks.forEach(c => chunkMap.set(c.id as string, c.content));

        const verifications = await verifyClaims(llmResponse.claims, chunkMap);
        
        const groundedClaims = verifications.filter(v => v.verdict === "yes");
        const flaggedClaimsData = verifications.filter(v => v.verdict !== "yes");

        if (groundedClaims.length === 0) {
            const response: QueryResponse = {
                answer: "I'm sorry, I cannot answer this question based on the provided 3GPP specifications.",
                citations: [],
                confidence: topScore,
                abstained: true,
                unresolvedReferences: unresolvedRefs,
                flaggedClaims: flaggedClaimsData.map(f => ({ text: f.claimText, reason: `Entailment check failed (${f.verdict})` }))
            };
            return res.json(response);
        }

        // 6. Format final answer and citations
        const finalCitations: Citation[] = [];
        let finalAnswer = "";

        groundedClaims.forEach((claim, index) => {
            const chunkId = claim.citedChunkId;
            const chunk = chunks.find(c => c.id === chunkId);
            
            finalAnswer += `${claim.claimText} [${index + 1}] `;

            if (chunk) {
                finalCitations.push({
                    spec: chunk.spec_id,
                    specVersion: chunk.version,
                    clause: `${chunk.clause_number} — ${chunk.clause_title}`,
                    page: chunk.page_number,
                    snippet: chunk.content.substring(0, 150) + "..."
                });
            }
        });

        const response: QueryResponse = {
            answer: finalAnswer.trim(),
            citations: finalCitations,
            confidence: topScore,
            abstained: false,
            unresolvedReferences: unresolvedRefs,
            flaggedClaims: flaggedClaimsData.length > 0 
                ? flaggedClaimsData.map(f => ({ text: f.claimText, reason: `Entailment check failed (${f.verdict})` })) 
                : undefined
        };

        res.json(response);
    } catch (err: any) {
        console.error("[api/query] Error:", err.message);
        res.status(500).json({ error: "Failed to process query" });
    }
});

export default router;
