import { supabase } from './supabaseClient';

export interface ExpandedRef {
  chunk: any | null; 
  referencedSpecId: string;
  referencedClauseNumber: string;
  resolved: boolean;
}

export async function expandReferences(
  chunkIds: string[],
  maxExpansion: number = 5
): Promise<ExpandedRef[]> {
  if (chunkIds.length === 0) return [];

  const { data: refs, error: refError } = await supabase
    .from('clause_references')
    .select('referenced_spec_id, referenced_clause_number')
    .in('source_chunk_id', chunkIds);

  if (refError) {
    console.error("[refExpander] Error fetching references:", refError);
    return [];
  }

  if (!refs || refs.length === 0) return [];

  // Deduplicate the references we need to fetch
  const uniqueRefs = new Map<string, any>();
  for (const ref of refs) {
      if (ref.referenced_clause_number) {
          const key = `${ref.referenced_spec_id}-${ref.referenced_clause_number}`;
          if (!uniqueRefs.has(key)) {
              uniqueRefs.set(key, ref);
          }
      }
  }

  const expanded: ExpandedRef[] = [];
  const refsToFetch = Array.from(uniqueRefs.values()).slice(0, maxExpansion);

  for (const ref of refsToFetch) {
    // Fetch the chunk with the highest version using order limit 1
    const { data: chunkData, error: chunkError } = await supabase
      .from('spec_chunks')
      .select('*')
      .eq('spec_id', ref.referenced_spec_id)
      .eq('clause_number', ref.referenced_clause_number)
      .order('spec_version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (chunkError) {
        console.error(`[refExpander] Error fetching chunk ${ref.referenced_spec_id} ${ref.referenced_clause_number}:`, chunkError);
    }

    expanded.push({
      chunk: chunkData ?? null,
      referencedSpecId: ref.referenced_spec_id,
      referencedClauseNumber: ref.referenced_clause_number,
      resolved: !!chunkData,
    });
  }
  
  return expanded;
}
