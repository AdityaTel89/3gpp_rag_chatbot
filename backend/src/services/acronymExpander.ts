import { supabase } from "./supabaseClient";

let acronymCache: Map<string, string> | null = null;

export async function loadAcronyms(specIds?: string[]): Promise<Map<string, string>> {
  if (acronymCache) return acronymCache;
  let query = supabase.from("spec_acronyms").select("acronym, expansion");
  if (specIds && specIds.length > 0) {
    query = query.in("spec_id", specIds);
  }
  const { data, error } = await query;

  if (error) {
    console.error("[acronymExpander] Error loading acronyms:", error);
    throw error;
  }

  acronymCache = new Map(data.map((r: any) => [r.acronym, r.expansion]));
  return acronymCache;
}

export function expandQuery(query: string, acronyms: Map<string, string>): string {
  let expanded = query;
  for (const [acronym, expansion] of acronyms) {
    // Only match whole words for acronyms
    const re = new RegExp(`\\b${acronym}\\b`, "g");
    if (re.test(expanded)) {
      expanded = expanded.replace(re, `${acronym} (${expansion})`);
    }
  }
  return expanded;
}
