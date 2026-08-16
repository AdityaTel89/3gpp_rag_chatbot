import { supabase } from "../src/services/supabaseClient";

async function main() {
    console.log("Deleting all data from clause_references...");
    let res = await supabase.from("clause_references").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (res.error) console.error("Error deleting clause_references:", res.error);
    else console.log("Done.");

    console.log("Deleting all data from spec_acronyms...");
    res = await supabase.from("spec_acronyms").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (res.error) console.error("Error deleting spec_acronyms:", res.error);
    else console.log("Done.");

    console.log("Deleting all data from spec_chunks...");
    res = await supabase.from("spec_chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (res.error) console.error("Error deleting spec_chunks:", res.error);
    else console.log("Done.");

    console.log("Database reset complete.");
}

main().catch(console.error);
