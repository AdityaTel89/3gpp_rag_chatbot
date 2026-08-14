import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

// Support both running from backend/ and from scripts/ subdirectory
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

// Fallback to process.env if already set (e.g., Docker/CI environment)
const supabaseUrl  = process.env.SUPABASE_URL  ?? "";
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!supabaseUrl || !supabaseKey) {
    console.warn(
        "[supabaseClient] WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY is not set. " +
        "Ensure .env is loaded before importing this module."
    );
}

export const supabase = createClient(supabaseUrl, supabaseKey);