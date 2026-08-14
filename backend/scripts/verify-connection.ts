import path from "path";
import dotenv from "dotenv";

// Load .env from backend/ directory (run from backend/)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { supabase } from "../src/services/supabaseClient";

async function main() {
    console.log("=== Supabase Connection Verification ===\n");

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
        console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
        process.exit(1);
    }

    console.log(`✓ SUPABASE_URL loaded: ${url}`);
    console.log(`✓ SUPABASE_SERVICE_KEY loaded: ${key.slice(0, 20)}...`);

    // 1. Basic connectivity test
    console.log("\n[1] Testing basic connectivity (SELECT 1)...");
    const { data: pingData, error: pingError } = await (supabase as any).rpc("pg_sleep", { seconds: 0 }).select();
    // Fallback: use a simple query
    const { data: testData, error: testError } = await supabase
        .from("spec_chunks")
        .select("id")
        .limit(1);

    if (testError) {
        if (testError.message.includes("does not exist")) {
            console.warn("⚠️  Table 'spec_chunks' does not exist yet.");
            console.warn("   → Run the schema from backend/supabase/schema.sql in the Supabase SQL editor.");
        } else {
            console.error("❌ Connection failed:", testError.message);
            process.exit(1);
        }
    } else {
        console.log("✓ Connection successful — 'spec_chunks' table exists");
        console.log(`✓ Current row count (sample): ${testData?.length ?? 0} rows returned (limit 1)`);
    }

    // 2. Check vector extension
    console.log("\n[2] Checking pgvector extension...");
    const { data: extData, error: extError } = await supabase
        .from("pg_extension")
        .select("extname")
        .eq("extname", "vector");

    if (extError) {
        // pg_extension may not be accessible from anon/service role depending on Supabase settings
        console.warn("⚠️  Could not query pg_extension (this is OK if RLS blocks it).");
        console.warn("   Verify manually: run `SELECT * FROM pg_extension WHERE extname = 'vector';` in SQL editor.");
    } else if (!extData || extData.length === 0) {
        console.warn("⚠️  pgvector extension not found. Run `CREATE EXTENSION IF NOT EXISTS vector;` in the SQL editor.");
    } else {
        console.log("✓ pgvector extension is enabled");
    }

    console.log("\n✅ Verification complete.\n");
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
