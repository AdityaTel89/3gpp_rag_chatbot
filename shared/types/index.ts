/**
 * Shared types for the 3GPP RAG Chatbot.
 * Importable by both backend (Node/TypeScript) and frontend (Vite/React/TypeScript).
 *
 * Backend: import { SpecChunk, Citation, QueryResponse } from '../../shared/types';
 * Frontend: configured via tsconfig paths alias `@shared` → `../../shared/types`
 */

// ---------------------------------------------------------------------------
// SpecChunk
// ---------------------------------------------------------------------------

/**
 * A single clause-bounded text chunk extracted from a 3GPP specification PDF.
 * Used during ingestion, storage, and retrieval.
 */
export interface SpecChunk {
  /** Internal Supabase row ID (uuid). Undefined before the row is persisted. */
  id?: string;

  /** Spec identifier, e.g. "TS 23.501" */
  spec_id: string;

  /** Release/version string, e.g. "Release 17" or "17.4.0" */
  version: string;

  /**
   * Hierarchical clause number, e.g. "6.3.2".
   * Empty string if the chunk falls outside a numbered clause.
   */
  clause_number: string;

  /** Human-readable clause title, e.g. "RRC connection establishment" */
  clause_title: string;

  /** 1-based page number in the source PDF where this chunk begins */
  page_number: number;

  /** 0-based index of this chunk within its clause (for ordering) */
  chunk_index: number;

  /** The raw text content of the chunk */
  content: string;

  /**
   * Dense embedding vector produced by all-MiniLM-L6-v2 (384 dimensions).
   * Stored in Supabase pgvector; omitted on the frontend.
   */
  embedding?: number[];

  /**
   * PostgreSQL tsvector for BM25/full-text search.
   * Auto-populated by a Postgres trigger; never set manually.
   */
  fts?: string;
}

// ---------------------------------------------------------------------------
// Citation
// ---------------------------------------------------------------------------

/**
 * A verifiable citation pointing to a clause in a 3GPP specification.
 * Every claim in a QueryResponse.answer must map to at least one Citation.
 */
export interface Citation {
  /** Spec identifier, e.g. "TS 23.501" */
  spec: string;

  /** Clause identifier with title, e.g. "6.3.2 — RRC connection establishment" */
  clause: string;

  /** 1-based page number in the source PDF */
  page: number;

  /**
   * Short verbatim snippet from the source chunk that supports the claim.
   * Shown in the CitationCard for user verification.
   */
  snippet?: string;
}

// ---------------------------------------------------------------------------
// QueryResponse
// ---------------------------------------------------------------------------

/**
 * Response shape returned by POST /api/query.
 * Consumed by the frontend useChat hook and rendered in the chat UI.
 */
export interface QueryResponse {
  /** LLM-generated answer text, with inline citation markers e.g. [1], [2] */
  answer: string;

  /**
   * Ordered list of citations referenced in the answer.
   * Index 0 → marker [1], index 1 → marker [2], etc.
   */
  citations: Citation[];

  /**
   * Normalised confidence score in [0, 1] derived from the fused retrieval
   * score of the top-ranked chunk. Drives the UI confidence indicator and
   * the abstention decision.
   */
  confidence: number;

  /**
   * True when the system abstained rather than generating an answer
   * (confidence below threshold, or topic out of scope).
   * The `answer` field contains the abstention message in this case.
   */
  abstained: boolean;
}

// ---------------------------------------------------------------------------
// QueryRequest
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/query.
 */
export interface QueryRequest {
  /** The user's natural-language question */
  question: string;

  /**
   * Optional spec filter to restrict retrieval to one spec.
   * When omitted all indexed specs are searched.
   * Example: "TS 23.501"
   */
  spec_filter?: string;
}
