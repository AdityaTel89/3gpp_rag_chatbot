# 3GPP RAG Chatbot — Quality Upgrade Implementation Plan

**Purpose:** Step-by-step plan to upgrade the existing RAG pipeline (embedding model, reranking, version handling, cross-reference resolution, per-claim grounding) without breaking what's already working.

**Sequencing rule:** Do these in order. Step 0 and Step 1 are non-negotiable first — Step 1 forces a schema change and full re-ingest, so everything downstream should be built against the *new* schema, not the old one. Re-run the eval harness after every step and log the numbers in `eval/results_log.md` (create this if it doesn't exist) so you can attribute quality changes to a specific step.

---

## Step 0 — Establish your baseline (do this before touching anything)

**Why first:** if you change five things and quality goes up, you won't know which change did it — or whether one of them quietly made things worse while another compensated.

1. Confirm `eval/test_questions.json` has at least your original 20-30 labeled questions across the four categories (in-scope/answerable, ambiguous, out-of-scope, adversarial).
2. Run `eval/run_eval.ts` against the *current, unmodified* pipeline.
3. Record baseline numbers in a new file `eval/results_log.md`:
   ```md
   ## Baseline (pre-upgrade) — YYYY-MM-DD
   - Recall@5: X
   - Recall@10: X
   - Citation precision: X
   - Abstention accuracy: X
   - False-abstention rate: X
   - Faithfulness (manual/LLM-graded): X
   ```
4. Do not proceed until this baseline is recorded.

---

## Step 1 — Swap the embedding model (bge-m3)

**Files touched:** `services/embedder.ts`, `supabase/schema.sql`, `scripts/ingest.ts`

**Why this order:** every other step either depends on chunks already being embedded correctly, or is independent of embedding — but this step requires a full re-ingest, so doing it later means re-ingesting twice.

### 1.1 — Update the schema

In `supabase/schema.sql`:
```sql
-- Old:
-- embedding vector(384),

-- New:
alter table spec_chunks
  drop column if exists embedding;

alter table spec_chunks
  add column embedding vector(1024); -- bge-m3 dense output dim

-- Rebuild the vector index (old one references the dropped column)
drop index if exists spec_chunks_embedding_idx;
create index spec_chunks_embedding_idx
  on spec_chunks using hnsw (embedding vector_cosine_ops);
```
> If you'd rather not drop data, create a new table `spec_chunks_v2` with the new dimension, backfill via re-ingest, then swap table names once verified. Safer if you have chunks you don't want to lose, but for MVP-stage data, drop-and-rebuild is simpler.

### 1.2 — Update the embedder service

In `services/embedder.ts`:
```ts
// Old: Xenova/all-MiniLM-L6-v2
// New: Xenova/bge-m3

import { pipeline } from '@xenova/transformers';

let embedder: any = null;

export async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/bge-m3');
  }
  return embedder;
}

export async function embedText(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
```
> Verify the ONNX export actually exists under the `Xenova` org before committing — check Hugging Face for `Xenova/bge-m3`. If it's not available, fall back to `Xenova/gte-large` (no query-prefix requirement, still local ONNX) and adjust `vector(1024)` to match its actual output dimension.

### 1.3 — Full re-ingest

1. Truncate `spec_chunks` (or drop/recreate if you went the safer route in 1.1).
2. Re-run `scripts/ingest.ts` against all source PDFs in `data/raw/`.
3. Spot-check: query a few known chunks manually and confirm embeddings are populated and the HNSW index built without error.

### 1.4 — Validate

Re-run the eval harness. Log results under `## Step 1 — bge-m3 embedding swap` in `results_log.md`. Compare Recall@k specifically against baseline — this is the number this step should move.

---

## Step 2 — Acronym/definitions-table query expansion

**Files touched:** new `services/acronymExpander.ts`, `scripts/ingest.ts`, `supabase/schema.sql`, `services/retriever.ts`

### 2.1 — New schema table

```sql
create table spec_acronyms (
  id         uuid primary key default gen_random_uuid(),
  spec_id    text not null,
  acronym    text not null,
  expansion  text not null,
  created_at timestamptz default now(),
  unique (spec_id, acronym)
);
```

### 2.2 — Extract definitions at ingest time

In `scripts/ingest.ts`, add a step that specifically targets the "Definitions and abbreviations" clause (conventionally clause 3, subclauses 3.1/3.2/3.3 depending on the spec):
```ts
// Pseudocode — adapt regex to actual formatting observed in your PDFs
function extractAcronyms(clauseText: string, specId: string): { acronym: string; expansion: string }[] {
  // Typical 3GPP format: "SMF   Session Management Function"
  const pattern = /^([A-Z0-9\-]{2,10})\s+(.+)$/gm;
  const matches = [...clauseText.matchAll(pattern)];
  return matches.map(m => ({ acronym: m[1], expansion: m[2].trim() }));
}
```
1. Detect the abbreviations clause during clause-structure parsing (same regex step you already use for `4.2.1`-style headings — target the heading text "abbreviations" or "definitions and symbols").
2. Run `extractAcronyms` on that clause's raw text.
3. Upsert into `spec_acronyms` (on conflict `(spec_id, acronym)` do nothing, or update — decide based on whether later specs should override earlier ones).
4. **Manually inspect the extracted table after first run** — 3GPP formatting isn't perfectly consistent across specs, so the regex will need a pass of manual correction/tuning against real output before you trust it.

### 2.3 — New acronym expander service

```ts
// services/acronymExpander.ts
import { supabase } from './supabaseClient';

let acronymCache: Map<string, string> | null = null;

export async function loadAcronyms(specIds: string[]): Promise<Map<string, string>> {
  if (acronymCache) return acronymCache;
  const { data, error } = await supabase
    .from('spec_acronyms')
    .select('acronym, expansion')
    .in('spec_id', specIds);
  if (error) throw error;
  acronymCache = new Map(data.map(r => [r.acronym, r.expansion]));
  return acronymCache;
}

export function expandQuery(query: string, acronyms: Map<string, string>): string {
  let expanded = query;
  for (const [acronym, expansion] of acronyms) {
    const re = new RegExp(`\\b${acronym}\\b`, 'g');
    if (re.test(expanded)) {
      expanded = expanded.replace(re, `${acronym} (${expansion})`);
    }
  }
  return expanded;
}
```

### 2.4 — Wire into retriever

In `services/retriever.ts`, before embedding the user query:
```ts
const acronyms = await loadAcronyms(indexedSpecIds);
const expandedQuery = expandQuery(rawQuery, acronyms);
const queryEmbedding = await embedText(expandedQuery);
```
> Use `expandedQuery` for embedding and for the full-text search branch. Keep `rawQuery` around for logging/debugging so you can see what got expanded.

### 2.5 — Validate

Re-run eval. This should specifically help queries using acronyms/jargon — check your "ambiguous" and "in-scope" category questions that use acronyms like SMF, AMF, PDU.

---

## Step 3 — Cross-encoder reranker

**Files touched:** new `services/reranker.ts`, `services/retriever.ts`

### 3.1 — New reranker service

```ts
// services/reranker.ts
import { pipeline } from '@xenova/transformers';

let reranker: any = null;

export async function getReranker() {
  if (!reranker) {
    reranker = await pipeline('text-classification', 'Xenova/bge-reranker-v2-m3');
  }
  return reranker;
}

export interface RerankCandidate {
  chunkId: string;
  text: string;
}

export async function rerank(
  query: string,
  candidates: RerankCandidate[],
  topN: number = 8
): Promise<(RerankCandidate & { rerankScore: number })[]> {
  const model = await getReranker();
  const scored = await Promise.all(
    candidates.map(async (c) => {
      const result = await model({ text: query, text_pair: c.text });
      return { ...c, rerankScore: result[0].score };
    })
  );
  return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topN);
}
```
> Verify the exact pipeline task type and output shape for `Xenova/bge-reranker-v2-m3` against its model card — cross-encoder rerankers sometimes need `text-classification` with a sigmoid score, sometimes a custom pooling step. Adjust the score extraction accordingly once you've run it once and inspected real output.

### 3.2 — Wire into retriever pipeline

In `services/retriever.ts`, insert **after** RRF fusion, **before** the confidence gate:
```ts
const fusedCandidates = fuseRRF(vectorResults, keywordResults); // existing step, ~20-30 candidates
const reranked = await rerank(expandedQuery, fusedCandidates, 8);
// Confidence gate now runs on reranked[0].rerankScore instead of raw RRF score
```

### 3.3 — Update the confidence gate

Your existing confidence gate (Section 5, Layer 3 of the original doc) was threshold-checking RRF/similarity scores. Recalibrate the threshold against reranker scores instead — these are not on the same scale as cosine similarity or RRF scores, so **do not reuse the old threshold value**. Determine a new threshold empirically:
1. Run reranking over your eval set's known-answerable and known-out-of-scope questions.
2. Look at the reranker score distribution for correct top-1 chunks vs. the distribution for out-of-scope questions (where nothing relevant exists).
3. Pick a threshold that separates the two distributions — this replaces guesswork with data.

### 3.4 — Validate

Re-run eval. This should improve citation precision and faithfulness most directly — check whether the top-1 retrieved chunk is now more often the actually-correct clause, not just a lexically-similar one.

---

## Step 4 — Version/release correctness

**Files touched:** `supabase/schema.sql`, `scripts/ingest.ts`, `services/retriever.ts`, `types/index.ts`

### 4.1 — Schema addition

```sql
alter table spec_chunks
  add column spec_version text not null default 'unknown';

-- Composite identity index — speeds up the ingest-time conflict check in 4.2
create index spec_chunks_identity_idx
  on spec_chunks (spec_id, release, clause_number, spec_version);
```
> Backfill `spec_version` for existing rows from whatever version metadata you recorded during original ingestion (check your PDF filenames/cover pages — 3GPP PDFs typically encode the version in the filename, e.g. `23501-h50.pdf` maps to a specific version string on the cover page).

### 4.2 — Ingest-time conflict guard

In `scripts/ingest.ts`, before inserting a new chunk:
```ts
async function checkVersionConflict(specId: string, release: string, clauseNumber: string, newText: string) {
  const { data } = await supabase
    .from('spec_chunks')
    .select('text, spec_version')
    .eq('spec_id', specId)
    .eq('release', release)
    .eq('clause_number', clauseNumber);

  const conflicting = data?.filter(row => row.text !== newText);
  if (conflicting && conflicting.length > 0) {
    console.warn(
      `⚠️  Version conflict: ${specId} ${release} clause ${clauseNumber} already indexed ` +
      `with different text under version(s): ${conflicting.map(c => c.spec_version).join(', ')}`
    );
    // Decide: throw to hard-block, or just warn and let ingest proceed —
    // recommend hard-block until you've deliberately decided to support multi-version indexing.
  }
}
```

### 4.3 — Retrieval-time version filtering

In `services/retriever.ts`, before running the vector/keyword queries:
```ts
async function getLatestVersions(specIds: string[]): Promise<Map<string, string>> {
  // Query distinct spec_version per spec_id, pick the max by your version-comparison logic
  // (3GPP versions are typically x.y.z — don't string-sort, parse and compare numerically)
}

const latestVersions = await getLatestVersions(targetSpecIds);
// Add a WHERE clause / filter step to both the vector and keyword queries:
// .eq('spec_version', latestVersions.get(specId))
// unless the user's query explicitly names an older release (parse for "Release 15" etc. in rawQuery)
```

### 4.4 — Update response types

In `types/index.ts`, add version info to `Citation` so the frontend can display it:
```ts
export interface Citation {
  specId: string;
  release: string;
  specVersion: string; // new
  clauseNumber: string;
  clauseTitle?: string;
  pageNumber?: number;
}
```

### 4.5 — Validate

Re-run eval. No existing eval question should regress. Add 2-3 new eval questions if you have multiple versions indexed for the same spec, to specifically test that filtering works.

---

## Step 5 — Cross-reference resolution

**Files touched:** `supabase/schema.sql`, `scripts/ingest.ts`, new `services/refExpander.ts`, `services/retriever.ts`, `types/index.ts`

### 5.1 — New schema table

```sql
create table clause_references (
  id                     uuid primary key default gen_random_uuid(),
  source_chunk_id        uuid references spec_chunks(id) on delete cascade,
  referenced_spec_id     text not null,
  referenced_clause_number text,
  created_at             timestamptz default now()
);

create index clause_references_source_idx on clause_references (source_chunk_id);
```

### 5.2 — Extract references at ingest time

In `scripts/ingest.ts`, after chunking, scan each chunk's raw text for reference patterns:
```ts
function extractReferences(chunkText: string, defaultSpecId: string): { specId: string; clauseNumber: string }[] {
  const refs: { specId: string; clauseNumber: string }[] = [];

  // Pattern 1: "see clause 5.3.4" / "clause 5.3.4" (same spec)
  const sameSpecPattern = /clause\s+(\d+(?:\.\d+)+)/gi;
  for (const m of chunkText.matchAll(sameSpecPattern)) {
    refs.push({ specId: defaultSpecId, clauseNumber: m[1] });
  }

  // Pattern 2: "TS 23.502" or "TS 23.502 clause 4.3.2" (cross-spec)
  const crossSpecPattern = /TS\s+(\d{2}\.\d{3})(?:\s+clause\s+(\d+(?:\.\d+)+))?/gi;
  for (const m of chunkText.matchAll(crossSpecPattern)) {
    refs.push({ specId: `TS ${m[1]}`, clauseNumber: m[2] ?? '' });
  }

  return refs;
}
```
1. Run this on every chunk during ingest.
2. Insert results into `clause_references`, one row per detected reference.
3. Inspect a sample manually — reference formatting varies enough across specs that you should expect some false positives/negatives and tune the regex accordingly.

### 5.3 — New reference expansion service

```ts
// services/refExpander.ts
import { supabase } from './supabaseClient';

export interface ExpandedRef {
  chunk: any | null; // populated chunk if found in corpus
  referencedSpecId: string;
  referencedClauseNumber: string;
  resolved: boolean;
}

export async function expandReferences(
  chunkIds: string[],
  maxExpansion: number = 5
): Promise<ExpandedRef[]> {
  const { data: refs } = await supabase
    .from('clause_references')
    .select('referenced_spec_id, referenced_clause_number')
    .in('source_chunk_id', chunkIds);

  if (!refs) return [];

  const expanded: ExpandedRef[] = [];
  for (const ref of refs.slice(0, maxExpansion)) {
    const { data: chunk } = await supabase
      .from('spec_chunks')
      .select('*')
      .eq('spec_id', ref.referenced_spec_id)
      .eq('clause_number', ref.referenced_clause_number)
      .maybeSingle();

    expanded.push({
      chunk: chunk ?? null,
      referencedSpecId: ref.referenced_spec_id,
      referencedClauseNumber: ref.referenced_clause_number,
      resolved: !!chunk,
    });
  }
  return expanded;
}
```

### 5.4 — Wire into retriever

In `services/retriever.ts`, after reranking (Step 3), before building the LLM prompt:
```ts
const topChunkIds = reranked.map(c => c.chunkId);
const expandedRefs = await expandReferences(topChunkIds, 5);

const resolvedExtraChunks = expandedRefs.filter(r => r.resolved).map(r => r.chunk);
const unresolvedRefs = expandedRefs.filter(r => !r.resolved);

// Dedupe resolvedExtraChunks against existing top-k before adding to context
const finalContext = dedupeChunks([...reranked, ...resolvedExtraChunks]);
```

### 5.5 — Surface unresolved references

In `types/index.ts`:
```ts
export interface QueryResponse {
  answer: string;
  citations: Citation[];
  confidence: number;
  abstained: boolean;
  unresolvedReferences?: { specId: string; clauseNumber: string }[]; // new
}
```
Update `services/llm.ts` prompt construction to mention unresolved references explicitly, so the model can note them rather than silently ignoring the gap: e.g. append a system-prompt line — "If the context mentions dependencies on unindexed material (listed below), state that explicitly rather than guessing at their content." Pass `unresolvedRefs` into the prompt as a labeled list.

Update the frontend (`AbstainNotice.tsx` or a new small component) to render `unresolvedReferences` if present, distinct from a full abstain — e.g. "Answer is based on indexed content; note this procedure also references TS 23.502 clause 4.3.2, which is not currently indexed."

### 5.6 — Validate

Re-run eval. Add 2-3 new eval questions specifically designed to require a cross-referenced clause, to confirm expansion is working. Check that unresolved-reference surfacing doesn't cause your abstention logic to over-trigger — expanding referenced content should improve completeness, not cause false abstentions.

---

## Step 6 — Per-claim grounding / entailment check

**Files touched:** `services/llm.ts`, `services/groundingCheck.ts`, `types/index.ts`

### 6.1 — Change LLM output format to structured claims

In `services/llm.ts`, update the generation prompt to request structured JSON instead of free text with inline citation markers:
```ts
const systemPrompt = `
You answer only from the provided context chunks. For your answer, output JSON in this exact shape:
{
  "claims": [
    { "text": "<one atomic factual claim>", "citedChunkId": "<chunk id from context>" }
  ]
}
Each claim must be a single, atomic, checkable statement. Do not combine multiple facts into one claim.
If the context does not contain enough information to answer, output: { "claims": [], "abstain": true }
`;
```
> Keep a few-shot example of correct structured output (including the abstain case) in the prompt, matching what your original doc already planned for the abstention behavior — same principle, now applied to the structured format.

### 6.2 — Per-claim entailment check

In `services/groundingCheck.ts`:
```ts
interface Claim {
  text: string;
  citedChunkId: string;
}

interface ClaimVerdict extends Claim {
  entailment: 'yes' | 'no' | 'not_stated';
}

export async function verifyClaims(
  claims: Claim[],
  chunkMap: Map<string, string> // chunkId -> chunk text
): Promise<ClaimVerdict[]> {
  const verdicts: ClaimVerdict[] = [];
  for (const claim of claims) {
    const chunkText = chunkMap.get(claim.citedChunkId);
    if (!chunkText) {
      verdicts.push({ ...claim, entailment: 'not_stated' });
      continue;
    }
    const entailment = await checkEntailment(claim.text, chunkText); // LLM or NLI call
    verdicts.push({ ...claim, entailment });
  }
  return verdicts;
}

async function checkEntailment(claim: string, chunkText: string): Promise<'yes' | 'no' | 'not_stated'> {
  const prompt = `Context: "${chunkText}"\nClaim: "${claim}"\nIs the claim entailed by the context? Answer only: yes, no, or not_stated.`;
  // Call Groq/Gemini with this prompt, parse the single-word response.
}
```

### 6.3 — Post-process before returning to frontend

In the main query handler (wherever `/api/query` assembles the final response):
```ts
const verdicts = await verifyClaims(claims, chunkMap);
const groundedClaims = verdicts.filter(v => v.entailment === 'yes');
const flaggedClaims = verdicts.filter(v => v.entailment !== 'yes');

if (groundedClaims.length === 0) {
  // No claims survived grounding — abstain
} else {
  // Compose final answer text from groundedClaims only, or
  // keep flaggedClaims but visibly mark them in the response
}
```
Decide your policy: strip ungrounded claims silently, or keep them but flag visibly in the UI (e.g. a caveat marker per sentence). Given the project's whole premise is trustworthiness, visible flagging is more honest than silent stripping — but silent stripping produces a cleaner-looking answer. Recommend: strip claims that fail entailment, but if that leaves the answer empty or clearly incomplete, abstain rather than return a partial answer with no indication anything was removed.

### 6.4 — Update types and frontend

```ts
export interface QueryResponse {
  answer: string;
  citations: Citation[];
  confidence: number;
  abstained: boolean;
  unresolvedReferences?: { specId: string; clauseNumber: string }[];
  flaggedClaims?: { text: string; reason: string }[]; // new
}
```
Update `MessageBubble.tsx` / `CitationCard.tsx` to render flagged claims distinctly if you choose the visible-flagging policy.

### 6.5 — Validate

Re-run eval, specifically checking faithfulness and citation precision — this step should catch misattributed citations (true claim, wrong chunk) that lexical overlap and whole-answer entailment both miss. Manually inspect a handful of flagged claims to confirm the entailment check itself isn't over- or under-triggering.

---

## Final validation pass

After all six steps:

1. Run the full eval harness once more end-to-end.
2. Compile a comparison table in `eval/results_log.md`:

   | Metric | Baseline | +Embedding | +Acronyms | +Rerank | +Version | +CrossRef | +PerClaim |
   |---|---|---|---|---|---|---|---|
   | Recall@5 | | | | | | | |
   | Recall@10 | | | | | | | |
   | Citation precision | | | | | | | |
   | Faithfulness | | | | | | | |
   | Abstention accuracy | | | | | | | |
   | False-abstention rate | | | | | | | |

3. If any step *regressed* a metric, don't just keep it because it's "supposed to help" — investigate why (common cause: a new threshold copied from the old scale, or a regex tuned on too small a sample).

## Sequencing summary

| Step | Depends on | Forces re-ingest? |
|---|---|---|
| 0. Baseline eval | — | No |
| 1. Embedding model swap | Step 0 | **Yes — full** |
| 2. Acronym expansion | Step 1 (embeds against new model) | Partial (acronym table only) |
| 3. Reranker | Step 1 | No |
| 4. Version tagging | — (independent, can run parallel to 1-3) | No (schema add + backfill) |
| 5. Cross-reference resolution | Step 1 (chunks must exist) | Partial (reference table only) |
| 6. Per-claim grounding | Steps 1-5 (needs stable retrieval/rerank to be meaningful to evaluate) | No |