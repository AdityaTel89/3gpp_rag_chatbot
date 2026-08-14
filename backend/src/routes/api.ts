import { Router, Request, Response } from "express";
import { supabase } from "../services/supabaseClient";
import { hybridSearch } from "../services/retriever";

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

// Raw hybrid search query (Phase 2 - No LLM yet)
router.post("/query", async (req: Request, res: Response): Promise<any> => {
    try {
        const { query, limit = 10 } = req.body;
        if (!query || typeof query !== "string") {
            return res.status(400).json({ error: "Missing or invalid 'query' string in body" });
        }

        const results = await hybridSearch(query, limit);

        // Return raw results for manual inspection and verification
        res.json({
            query,
            count: results.length,
            results
        });
    } catch (err: any) {
        console.error("[api/query] Error:", err.message);
        res.status(500).json({ error: "Failed to process query" });
    }
});

export default router;
