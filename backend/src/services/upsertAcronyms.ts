import { supabase } from "./supabaseClient";

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;

export async function upsertAcronyms(
    acronyms: { specId: string; acronym: string; expansion: string }[]
) {
    if (acronyms.length === 0) return;

    // We don't delete existing acronyms here because we rely on the UNIQUE constraint
    // and ON CONFLICT DO NOTHING to handle overlaps gracefully.

    const rows = acronyms.map(a => ({
        spec_id: a.specId,
        acronym: a.acronym,
        expansion: a.expansion
    }));

    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        let lastError: any = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            // Using insert without explicitly stating ON CONFLICT DO NOTHING will fail if conflict exists.
            // But Supabase JS does not support ON CONFLICT directly via insert unless using upsert.
            // Using upsert with onConflict handles this cleanly.
            const { error } = await supabase
                .from("spec_acronyms")
                .upsert(batch, { onConflict: "spec_id, acronym", ignoreDuplicates: true });

            if (!error) {
                lastError = null;
                break;
            }
            lastError = error;
            if (attempt < MAX_RETRIES) {
                console.warn(`[upsertAcronyms] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (attempt ${attempt}): ${error.message}. Retrying...`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }

        if (lastError) throw lastError;

        inserted += batch.length;
        console.log(`[upsertAcronyms] Processed ${inserted}/${rows.length} acronyms`);
    }
}
