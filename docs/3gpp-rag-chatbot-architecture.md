# 3GPP RAG Chatbot — Architecture & Development Plan
**Role framing:** Senior AI/RAG Architect design doc for a Graduate Engineer Trainee technical assessment
**Deadline:** Aug 17, 2026 (4 working days from today, Aug 13)
**Constraints honored:** Node.js/React-first stack, free-tier services preferred, no implementation yet.

---

## 1. Project Overview & Problem Statement

**Problem.** 3GPP specifications (TS/TR documents) are long, cross-referencing, and terminology-dense. Engineers need fast, trustworthy answers ("What is the default DRB establishment procedure in TS 38.331?") without being handed a hallucinated procedure that doesn't exist in the spec — in telecom, a wrong answer is worse than no answer.

**Goal.** Build a RAG chatbot that:
- Answers only from retrieved 3GPP text (retrieval-grounded generation, not parametric knowledge).
- Cites the exact spec, section, and page/clause for every claim.
- **Abstains** ("I don't have enough evidence in the indexed specs to answer this") when retrieval confidence is low, rather than guessing.
- Is small enough for one developer to build, evaluate, and defend in an interview within ~4 days.

**Why this matters for the assessment.** It demonstrates you understand RAG isn't "vector search + LLM" — it's an evidence pipeline with explicit failure modes (retrieval miss, chunking loses context, LLM ignores context, LLM over-generalizes) and each needs a mitigation. That's the story you tell the evaluator.

---

## 2. Recommended Tech Stack (Node.js/React-first, free-tier)

You know React + Node — good news: modern RAG doesn't require Python. Every stage below has a mature JS/TS option.

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React (Vite) + TypeScript + Tailwind | You already know React; TS gives you compile-time safety on API response shapes (citations, confidence, abstained flag), which matters when the whole point of the app is trustworthy output. |
| **Backend API** | Node.js + Express (or Fastify) + TypeScript | Your language, typed. Shared types (e.g. `QueryResponse`, `Citation`) can live in a small shared package/folder and be imported by both frontend and backend — a nice benefit of an all-TS stack. |
| **PDF parsing** | `pdf-parse` or `pdfjs-dist`, fallback to `pdf2json` for tables | Pure JS/TS, no Python dependency. 3GPP PDFs are mostly text with some tables/figures — acceptable loss for MVP. Types available via `@types/pdf-parse` or hand-rolled minimal types. |
| **Chunking** | Custom clause-aware splitter (regex on `4.2.1`, `5.3`, heading patterns) + `langchain` `RecursiveCharacterTextSplitter` (JS/TS port) as fallback | 3GPP docs are already hierarchically numbered — exploit that instead of naive fixed-size chunking. This is a key "smart" design point for the interview. |
| **Embeddings** | **Xenova/transformers.js** running `all-MiniLM-L6-v2` locally (free, no API key, runs in Node, ships TS types) — *or* Google Gemini `text-embedding-004` (generous free tier) as a stretch upgrade | Zero Python, zero cost, keeps the whole pipeline in TypeScript. |
| **Vector DB** | **Supabase (Postgres + `pgvector` extension)**, free tier | ✅ Applicable and a good fit at this scale (a few hundred to low-thousands of chunks). Supabase gives you a hosted Postgres with `pgvector` already installable, a generous free tier, a typed JS/TS client (`@supabase/supabase-js`), and — importantly — lets you do **vector search, keyword search, and metadata storage in one database** instead of running a separate vector DB service. This *simplifies* the architecture vs. the earlier Qdrant plan: one less container, one less client library, one place to write hybrid-retrieval SQL. |
| **Keyword search (for hybrid)** | Postgres full-text search (`tsvector`/`ts_rank`, built into Supabase/Postgres) instead of a separate BM25 library | Since you're already on Postgres for vectors, native full-text search gets you keyword/BM25-style scoring **in the same query engine**, avoiding a second in-memory index to keep in sync. This is the single biggest simplification from switching to Supabase. |
| **Reranker (stretch)** | Cohere free-tier Rerank API (REST call from Node/TS) | Optional if time allows; improves precision of top-k passed to the LLM. Cut from MVP if time-constrained. |
| **LLM** | **Groq API** (free tier, very fast, Llama 3.1/3.3 70B) or **Google Gemini 2.0 Flash** (free tier) | Both have generous free quotas and low latency — important when you're demoing live. Avoid paid OpenAI/Anthropic API for this if budget is a concern. |
| **Grounding/verification** | Rule-based + LLM self-check ("does every sentence in the answer map to a retrieved chunk?") — no separate ML model needed for MVP | Keeps MVP simple; see Section 5. |
| **Containerization** | Docker Compose (Node/TS API + React build). **No local DB container needed** — Supabase free tier is hosted, so you only containerize your own app. | Fewer moving parts to keep alive during grading; one less thing that can break in a live demo. |
| **Hosting (optional demo)** | Render/Railway free tier for API, Vercel free tier for frontend, Supabase free tier (already hosted, no extra step) | Only if you want a public demo link; otherwise `docker compose up` locally + your Supabase project is enough. |

**Trade-off worth naming honestly (Supabase/pgvector vs. a dedicated vector DB like Qdrant/Pinecone):** at MVP scale (a few hundred to a few thousand chunks) `pgvector`'s HNSW/IVFFlat indexing is plenty fast and the operational simplicity wins. At large scale (millions of vectors, high QPS) a purpose-built vector DB with more tuning knobs and horizontal scaling would likely outperform it. That's a good, honest trade-off to state in the interview if asked "why not Qdrant/Pinecone."

**Why not Python?** Not because it's worse for RAG — it's the more common industry default — but you know TypeScript, and TS has adequate equivalents for every stage at MVP scale, with the added benefit of shared types between frontend and backend. If asked in the interview: *"I chose an all-TypeScript pipeline for velocity and type-safety given my existing skill set; at production scale I'd evaluate Python's richer ML tooling for the offline ingestion job specifically, while keeping the TS API for serving."*

---

## 3. Complete System Architecture

```
                         ┌─────────────────────────────────────────┐
                         │            INGESTION (offline)            │
                         │                                           │
  3GPP PDFs  ──▶  PDF Parser  ──▶  Clause-aware Chunker  ──▶  Embedder │
                         │                                    │      │
                         │                                    ▼      │
                         │                    ┌────────────────────┐ │
                         │                    │  Supabase Postgres │ │
                         │                    │  ─────────────────│ │
                         │                    │  • pgvector column │ │
                         │                    │    (embeddings)    │ │
                         │                    │  • tsvector column │ │
                         │                    │    (full-text)     │ │
                         │                    │  • metadata columns│ │
                         │                    │    (spec, clause,  │ │
                         │                    │     page, etc.)    │ │
                         │                    └────────────────────┘ │
                         └─────────────────────────────────────────┘

                         ┌─────────────────────────────────────────┐
                         │              QUERY (online)                │
                         │                                           │
   User question ──▶ Query embed ──▶ Hybrid Retrieve (single SQL:     │
                         │           pgvector similarity + ts_rank)  │
                         │                    │                       │
                         │              RRF score fusion               │
                         │                    │                       │
                         │             (optional) Rerank              │
                         │                    │                       │
                         │           Confidence check ──▶ [LOW] ──▶ ABSTAIN │
                         │                    │ [OK]                  │
                         │                    ▼                       │
                         │        Build prompt: question + top-k       │
                         │        chunks (with spec/clause labels)     │
                         │                    │                       │
                         │                    ▼                       │
                         │              LLM generation                 │
                         │        (system prompt: "answer ONLY        │
                         │         from context, cite clause,          │
                         │         say 'not found' if absent")         │
                         │                    │                       │
                         │                    ▼                       │
                         │        Post-hoc grounding check:            │
                         │        does answer text overlap             │
                         │        with retrieved chunks?                │
                         │        [FAIL] ──▶ ABSTAIN / caveat           │
                         │        [PASS] ──▶ return answer + citations │
                         └─────────────────────────────────────────┘
```

**Design principle:** hallucination defense is *layered*, not a single filter — retrieval quality, prompt constraints, and post-generation verification each catch different failure modes.

---

## 4. Detailed End-to-End Workflows

### 4.1 Ingestion workflow (run once per document, offline job)
1. Download 3GPP spec PDF(s) manually from the 3GPP portal (see Section 6) into `data/raw/`.
2. Parse PDF → extract text with page numbers preserved.
3. Detect clause structure (regex on numbered headings like `6.3.2 RRC connection establishment`) to build a hierarchical outline.
4. Chunk text **within clause boundaries** (target ~300–500 tokens/chunk, with 1 clause = 1+ chunks, never splitting mid-sentence where avoidable). Attach metadata: `{ spec_id, version, clause_number, clause_title, page_number, chunk_index }`.
5. Generate embeddings for each chunk (transformers.js, batched).
6. Upsert into Qdrant with metadata payload.
7. Build/update BM25 index over the same chunk set (stored as JSON or SQLite for MVP — no need for a separate search engine).
8. Log ingestion stats (chunk count, avg length, failed pages) for your own QA.

### 4.2 Query workflow (per user question)
1. User submits question via React chat UI.
2. Backend embeds the query.
3. Run vector search (top ~20 from Qdrant) **and** BM25 search (top ~20) in parallel.
4. Fuse rankings via Reciprocal Rank Fusion (RRF) — simple, no training needed, works well combining dense+sparse.
5. (Stretch) Rerank fused top ~20 down to top 5 via Cohere rerank.
6. **Confidence gate:** if top result's fused score is below a threshold, or if the top results disagree wildly on topic (e.g., low keyword overlap with the query), skip generation → return abstain message directly.
7. Construct prompt: system instructions (strict grounding rules) + numbered context chunks (each labeled with spec/clause/page) + user question.
8. Call LLM, request answer **with inline citation markers** referencing chunk numbers.
9. Post-process: verify every citation marker maps to a real retrieved chunk (no invented citation IDs); optionally run a lightweight lexical-overlap check between answer sentences and cited chunk text.
10. Return `{ answer, citations: [{spec, clause, page}], confidence, abstained: bool }` to frontend.
11. Frontend renders answer with clickable citation chips.

---

## 5. Minimizing Hallucination & Abstention Strategy

Be upfront in your writeup and interview: **no RAG system is 100% hallucination-free.** The goal is defense-in-depth that makes ungrounded answers rare and, when they slip through, low-confidence and clearly cited so a human can verify.

**Layer 1 — Retrieval quality.**
- Hybrid search (dense + BM25) catches both semantic and exact-terminology queries (spec IDs, acronyms like "PDCP", "gNB" are often better served by keyword match than embeddings).
- Clause-aware chunking preserves procedural context instead of cutting a numbered list in half.

**Layer 2 — Prompt-level constraints.**
- System prompt explicitly instructs: *"Answer only using the provided context. If the answer is not present, say so explicitly. Never use outside knowledge. Cite the clause number for every factual claim."*
- Few-shot example in the prompt showing a correct abstention response, so the model has a template to follow.

**Layer 3 — Confidence gating (pre-generation abstention).**
- If retrieval scores are below threshold, or the query looks off-topic (e.g., fuzzy match against a small "known domain" keyword set), skip the LLM call entirely and abstain. This also saves API cost/latency.

**Layer 4 — Post-generation grounding check.**
- Cheap heuristic: split answer into sentences, check each has reasonable lexical/semantic overlap with at least one retrieved chunk. Flag ungrounded sentences.
- Stretch: a second, cheap LLM call ("Given this context and this answer, does the answer follow only from the context? yes/no + explain") — a lightweight NLI-style self-check. Only add this if time allows post-MVP; it doubles latency and cost.

**When to abstain (explicit rules to implement):**
- No chunk retrieved above similarity/BM25 threshold.
- Top retrieved chunks are topically inconsistent with each other (possible off-domain question).
- LLM itself signals uncertainty in reasoning (optional, if using a "think step by step then answer" prompt structure).
- Post-hoc grounding check fails.

State this plainly to the evaluator: *"This is a probabilistic reduction of hallucination risk via retrieval quality, prompt constraints, and verification — not a guarantee."*

---

## 6. Recommended 3GPP Specs for Initial Dataset

Pick a **small, well-known, well-structured** set — 2–3 specs max for a 4-day MVP:

1. **TS 23.501** — System architecture for 5G System (5GS). Good general-purpose spec, well-known concepts (AMF, SMF, UPF), lots of clear definitions — great for demo questions.
2. **TS 38.300** — NR and NG-RAN overall description. Well-structured, procedural, good for "how does X work" questions.
3. **TS 38.331** — RRC protocol specification (optional 3rd doc, more detailed/technical — good if you want a harder demo question).

All are freely downloadable from the official 3GPP specification portal (search "3GPP TS 23.501" → 3gpp.org). Use the **latest stable release version** and record the version number in metadata — 3GPP specs are versioned per release (e.g., Release 17), which matters for citation accuracy.

Keep total corpus to a few hundred pages for MVP — enough to demonstrate real retrieval behavior without a multi-day ingestion/tuning cycle.

---

## 7. Vector DB Schema & Metadata Design (Supabase/Postgres)

**Table:** `spec_chunks`

```sql
create extension if not exists vector;

create table spec_chunks (
  id            uuid primary key default gen_random_uuid(),
  spec_id       text not null,           -- e.g. "TS 23.501"
  release       text not null,           -- e.g. "Rel-17"
  clause_number text not null,           -- e.g. "5.3.2"
  clause_title  text,                    -- human-readable heading
  page_number   int,                     -- for citation deep-link
  chunk_index   int,                     -- order within clause
  text          text not null,           -- raw chunk text (used for both display and full-text search)
  char_count    int,
  embedding     vector(384),             -- MiniLM dim (adjust if you switch embedding models)
  fts           tsvector generated always as (to_tsvector('english', text)) stored,
  created_at    timestamptz default now()
);

-- Vector similarity index
create index on spec_chunks using hnsw (embedding vector_cosine_ops);

-- Full-text search index (keyword/BM25-style retrieval)
create index on spec_chunks using gin (fts);
```

**Why one table instead of a vector store + separate keyword index:** both retrieval signals (`embedding <=> query_embedding` for cosine similarity, `fts @@ websearch_to_tsquery(...)` for keyword match) can be computed in a **single SQL query**, then fused (e.g. Reciprocal Rank Fusion) in application code. This removes the "two indexes to keep in sync" problem you'd have with Qdrant + a separate BM25 store, which is a real simplification for a 4-day build.

**Retrieval query shape (conceptual):**
```sql
select id, spec_id, clause_number, clause_title, page_number, text,
       1 - (embedding <=> $1) as vector_score,
       ts_rank(fts, websearch_to_tsquery('english', $2)) as keyword_score
from spec_chunks
order by vector_score desc
limit 20;
-- run a second query ordered by keyword_score, fuse both result sets in Node/TS via RRF
```

**Typed access from TS:** define a `SpecChunk` interface matching this schema, use `@supabase/supabase-js` (which supports generated types via the Supabase CLI: `supabase gen types typescript`) so query results are typed end-to-end.

---

## 8. Backend API Structure (Express)

```
POST   /api/ingest              # trigger ingestion job for a PDF (admin/dev use)
GET    /api/ingest/status       # check ingestion job progress
POST   /api/query                # { question } -> { answer, citations, abstained, confidence }
GET    /api/specs                # list indexed specs (for UI dropdown/filter)
GET    /api/health               # liveness check (Qdrant reachable, index loaded)
```

Internal modules (not endpoints, just service structure — all `.ts`):
- `services/pdfParser.ts`
- `services/chunker.ts`
- `services/embedder.ts`
- `services/supabaseClient.ts` (typed Supabase client init)
- `services/retriever.ts` (runs the vector + keyword SQL queries, fuses via RRF)
- `services/llm.ts` (Groq/Gemini call wrapper + prompt templates)
- `services/groundingCheck.ts`
- `types/index.ts` (`SpecChunk`, `Citation`, `QueryResponse`, etc. — importable by the frontend too)

---

## 9. Frontend Structure (React)

```
src/
 ├─ components/
 │   ├─ ChatWindow.tsx
 │   ├─ MessageBubble.tsx        # renders answer + inline citation chips
 │   ├─ CitationCard.tsx         # expandable: spec, clause, page, snippet
 │   ├─ AbstainNotice.tsx        # distinct styling for "not found in specs"
 │   └─ SpecFilterDropdown.tsx   # optional: scope query to one spec
 ├─ hooks/
 │   └─ useChat.ts                # handles POST /api/query, typed with shared QueryResponse type
 ├─ pages/
 │   └─ ChatPage.tsx
 ├─ types/                        # can mirror/import backend's types/index.ts if you set up a shared package
 └─ App.tsx
```

Keep it a single-page chat UI. The differentiator for the assessment isn't UI polish — it's **visibly showing citations and abstention behavior** clearly in the interface (e.g., a red/amber "low confidence — could not verify in indexed specs" banner).

---

## 10. Project Folder Structure

```
3gpp-rag-chatbot/
 ├─ backend/
 │   ├─ src/
 │   │   ├─ routes/
 │   │   ├─ services/
 │   │   ├─ prompts/
 │   │   ├─ types/
 │   │   └─ index.ts
 │   ├─ scripts/
 │   │   └─ ingest.ts              # CLI: ts-node ingest.ts <pdf-path>
 │   ├─ supabase/
 │   │   └─ schema.sql             # the spec_chunks table + indexes from Section 7
 │   ├─ Dockerfile
 │   ├─ tsconfig.json
 │   └─ package.json
 ├─ frontend/
 │   ├─ src/
 │   ├─ Dockerfile
 │   ├─ tsconfig.json
 │   └─ package.json
 ├─ data/
 │   ├─ raw/                       # source PDFs
 │   └─ processed/                 # chunked JSON (for inspection/debug)
 ├─ eval/
 │   ├─ test_questions.json        # your labeled eval set
 │   └─ run_eval.ts
 ├─ docker-compose.yml
 └─ README.md
```

---

## 11. Evaluation Strategy

Build a small labeled test set (~20–30 questions) covering four categories, and score each:

| Category | # Qs | What you're measuring |
|---|---|---|
| **In-scope, answerable** | ~12 | Retrieval accuracy (right chunk retrieved?) + faithfulness (answer matches source) + citation accuracy (cited clause is the actual source) |
| **In-scope but ambiguous/edge-case** | ~4 | Does it hedge appropriately rather than overstate confidence? |
| **Out-of-scope (not in indexed specs)** | ~6 | **Abstention rate** — does it correctly refuse rather than hallucinate? |
| **Adversarial (trick questions, wrong spec IDs, non-existent procedures)** | ~4 | Robustness — does it get misled by the phrasing of the question? |

**Metrics to report:**
- Retrieval Recall@k (is the correct clause in top-k retrieved chunks?)
- Faithfulness (manual or LLM-graded: does every claim in the answer trace to a retrieved chunk?)
- Citation precision (cited clause actually supports the claim — check manually for your demo set)
- Abstention accuracy (correctly abstained / should-have-abstained)
- False-abstention rate (abstained when it shouldn't have — also a failure mode worth reporting)

This evaluation table *is* your interview deliverable — walk in with actual numbers, not just claims.

---

## 12. Docker/Deployment Architecture

```yaml
# docker-compose.yml (conceptual)
services:
  backend:
    build: ./backend
    ports: ["3001:3001"]
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - GROQ_API_KEY=${GROQ_API_KEY}

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
```

Note there's **no local database container** — Supabase is hosted (free tier), so `docker compose up` only starts your own two services and connects out to your Supabase project. This is one less thing to keep alive during grading and one less thing that can silently break in a live demo. If you want a fully public demo link: Railway/Render free tier for the backend + Vercel free tier for the frontend, both pointing at the same Supabase project — no extra deployment step needed for the DB itself.

---

## 13. Realistic MVP Scope (Aug 13 → Aug 17)

**Cut list first — what's explicitly OUT of MVP:**
- Reranking model (use RRF fusion only)
- Multi-turn conversational memory (single-turn Q&A is enough)
- Streaming responses
- User auth/multi-user
- Full 3GPP corpus (2–3 specs only, few hundred pages)
- Automated NLI-based grounding check (use lexical-overlap heuristic instead)
- Public deployment (local Docker Compose is a valid deliverable)

**Day-by-day plan:**

- **Day 1 (Aug 13, today):** Finalize architecture (this doc), set up repo skeleton, Docker Compose with Qdrant running, download 2 target specs, get PDF parsing + clause-aware chunking working end-to-end on one spec, inspect chunk quality manually.
- **Day 2 (Aug 14):** Embedding pipeline (transformers.js) + Qdrant upsert working; BM25 index built; basic `/api/query` returning raw hybrid-retrieved chunks (no LLM yet) — validate retrieval quality first, before adding generation.
- **Day 3 (Aug 15):** Wire in LLM (Groq/Gemini) with grounding-constrained prompt + citation formatting + abstention logic (confidence gate + post-hoc check). Build minimal React chat UI, connect end-to-end.
- **Day 4 (Aug 16):** Build eval set (20–30 Qs), run evaluation, tune thresholds (retrieval top-k, abstention cutoff, chunk size) based on real failures. Polish UI (citation chips, abstain banner). Write README with architecture summary + eval results.
- **Buffer (Aug 17 morning):** Final smoke test of `docker compose up` from a clean clone, record a short demo/walkthrough if required, prepare interview talking points from Section 14.

**Definition of done for MVP:** a working local system, 2 specs indexed, hybrid retrieval, grounded generation with citations, functioning abstention, a documented evaluation table with real numbers, and a clear written explanation of trade-offs made under time constraints.

---

## 14. Likely Interview Questions

1. Why hybrid retrieval (BM25 + vector) instead of vector-only? Give a concrete example query where each alone would fail.
2. Walk through what happens end-to-end when the retrieved chunks are relevant but the LLM still adds an unsupported detail — where does your system catch that, if at all?
3. Why clause-aware chunking instead of fixed-size chunking? What failure mode does naive chunking create in a numbered spec document?
4. How did you choose your abstention threshold, and how did you validate it wasn't too aggressive (false abstentions) or too lax (missed abstentions)?
5. What's the difference between "the answer is grounded" and "the answer is correct"? Can a grounded answer still be wrong?
6. How would this scale to the full 3GPP corpus (thousands of pages, many releases)? What would break first?
7. Why did you pick Supabase/pgvector over a dedicated vector DB like Qdrant/Pinecone/Weaviate? What would change your choice at larger scale?
8. How do you handle spec versioning (Release 15 vs Release 17 saying different things about the same procedure)?
9. If you had two more weeks, what's the next thing you'd build — reranking, better chunking, multi-turn memory, or something else — and why that order?
10. What's your actual, honest hallucination rate on your eval set, and what does that number *not* tell you?

---

### Summary
This is an all-TypeScript RAG stack (React + Node/Express + Supabase/pgvector + transformers.js + Postgres full-text search + Groq/Gemini, all free-tier), with hallucination defense built as four layers (retrieval quality → prompt constraints → confidence gating → post-hoc grounding check), scoped to 2–3 well-known 3GPP specs, and a 4-day build plan ending in a documented evaluation table rather than just a demo. Using Supabase instead of a standalone vector DB collapses vectors, keyword search, and metadata into one hosted, typed database — one less container to run and one less index to keep in sync.

**Next step:** once you review and adjust this, tell me and I'll write the actual implementation prompt/plan step by step (starting with repo skeleton + ingestion pipeline first, so we validate retrieval quality before touching the LLM layer).
