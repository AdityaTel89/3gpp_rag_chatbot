import { Router, Request, Response } from "express";
import { supabase } from "../services/supabaseClient";
import { hybridSearch } from "../services/retriever";
import { generateAnswer } from "../services/llm";
import { checkGrounding } from "../services/groundingCheck";
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
        // Unfortunately Supabase JS does not have `.distinct()` out of the box,
        // so we fetch a small subset of fields or we can create an RPC for this later.
        // For now, we'll fetch spec_id and release and deduplicate in code.
        const { data, error } = await supabase.from("spec_chunks").select("spec_id, release");
        if (error) throw error;

        const uniqueSpecs = new Map<string, any>();
        data?.forEach((row: any) => {
            const key = `${row.spec_id}-${row.release}`;
            if (!uniqueSpecs.has(key)) {
                uniqueSpecs.set(key, { spec_id: row.spec_id, release: row.release });
            }
        });

        res.json(Array.from(uniqueSpecs.values()));
    } catch (err: any) {
        console.error("[api/specs] Error:", err.message);
        res.status(500).json({ error: "Failed to fetch specs" });
    }
});

// ... existing code up to specs route ...

// Full LLM Query Pipeline (Phase 3)
router.post("/query", async (req: Request, res: Response): Promise<any> => {
    try {
        const { query, limit = 10 } = req.body;
        if (!query || typeof query !== "string") {
            return res.status(400).json({ error: "Missing or invalid 'query' string in body" });
        }

        // 1. Hybrid Search
        const results = await hybridSearch(query, limit);

        // Map RetrievalResult to SpecChunk for shared types
        const chunks: SpecChunk[] = results.map(r => ({
            id: r.id,
            spec_id: r.spec_id,
            version: r.release,
            clause_number: r.clause_number,
            clause_title: r.clause_title || "",
            page_number: r.page_number || 1,
            chunk_index: r.chunk_index,
            content: r.text
        }));

        // 2. Confidence Gate
        // Normalize RRF score (max theoretical is around ~0.033 for rank 1+1, we'll use a relative heuristic or direct threshold)
        // Let's use a simple threshold on the raw RRF score for now, e.g., 0.015
        const topScore = results.length > 0 ? results[0].score : 0;
        const confidenceThreshold = 0.015;
        const isConfident = topScore >= confidenceThreshold;

        // 3. Topic Consistency Check (Simple keyword heuristic)
        const telecomKeywords = ["3gpp", "ue", "gnb", "enb", "rrc", "5g", "nr", "lte", "network", "cell", "bearer", "pdu", "smf", "amf", "upf"];
        const queryLower = query.toLowerCase();
        const isTopicConsistent = telecomKeywords.some(kw => queryLower.includes(kw));

        if (!isConfident || !isTopicConsistent || chunks.length === 0) {
            const response: QueryResponse = {
                answer: "I'm sorry, I cannot answer this question based on the provided 3GPP specifications.",
                citations: [],
                confidence: topScore, // We'll pass the raw score or normalized
                abstained: true
            };
            return res.json(response);
        }

        // 4. LLM Generation
        const answer = await generateAnswer(query, chunks);

        // 5. Grounding Check
        const groundingResult = checkGrounding(answer, chunks);
        
        let finalAnswer = answer;
        let abstained = false;
        const abstainMessage = "I'm sorry, I cannot answer this question based on the provided 3GPP specifications.";

        if (!groundingResult.isGrounded) {
            console.warn(`[api/query] Grounding failed: ${groundingResult.reason}`);
            // Fallback to abstention if it hallucinates
            finalAnswer = abstainMessage;
            abstained = true;
        } else if (finalAnswer.includes(abstainMessage)) {
            // The LLM followed instructions and intentionally abstained
            abstained = true;
        }

        // Build citations array (only if we didn't abstain)
        const citations: Citation[] = abstained ? [] : chunks.map(c => ({
            spec: c.spec_id,
            clause: `${c.clause_number} — ${c.clause_title}`,
            page: c.page_number,
            snippet: c.content.substring(0, 150) + "..."
        }));

        const response: QueryResponse = {
            answer: finalAnswer,
            citations,
            confidence: topScore,
            abstained
        };

        res.json(response);
    } catch (err: any) {
        console.error("[api/query] Error:", err.message);
        res.status(500).json({ error: "Failed to process query" });
    }
});

export default router;
