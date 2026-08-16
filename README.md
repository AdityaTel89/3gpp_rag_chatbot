# 3GPP RAG Chatbot

An enterprise-grade Retrieval-Augmented Generation (RAG) assistant specifically engineered for querying 3GPP Technical Specifications (e.g., **TS 23.501** for 5G System Architecture and **TS 38.300** for NR/NG-RAN Overall Description).

The system performs domain-aware hybrid retrieval with cross-encoder reranking, automated query acronym expansion, and atomic claim-level grounding verification to strictly eliminate hallucinations and enforce faithful citations.

---

## 🏗️ Architecture & Pipeline Overview

```
[ User Query ]
      │
      ▼
[ Acronym Expansion ] ──► (e.g., "gNB" -> "gNB (Next Generation NodeB)")
      │
      ├───────────────────────────────┐
      ▼                               ▼
[ Dense Vector Search ]     [ Sparse BM25 Keyword Search ]
 (BGE-M3: 1024-dim,          (PostgreSQL Full-Text Search
  Cosine Similarity)          with English Dictionary)
      │                               │
      └───────────────┬───────────────┘
                      ▼
        [ Reciprocal Rank Fusion (RRF) ]
                      │
                      ▼
     [ Cross-Encoder Reranker ] (Xenova/bge-reranker-base)
                      │
                      ▼
          [ Reference Expansion ] ──► (Resolves cited sub-clauses)
                      │
                      ▼
            [ Confidence Gate ] ──► (Abstains if relevance < threshold)
                      │
                      ▼
      [ LLM Generation (Groq LLaMA 3.1 8B Instant) ]
                      │
                      ▼
   [ Entailment Grounding Verification ] ──► (NLI check per atomic claim)
                      │
                      ▼
        [ Final Cited Response ]
```

### Core Components
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS (Responsive chat interface with markdown formatting, inline citation badges, snippet inspection modal, and specification filters).
- **Backend API**: Node.js + Express + TypeScript.
- **Database & Vector Store**: Supabase (PostgreSQL + `pgvector` with HNSW indexing).
- **Embeddings**: `Xenova/bge-m3` (1024-dimensional dense vectors via ONNX runtime).
- **Reranker**: `Xenova/bge-reranker-base` (Cross-encoder scoring query-chunk relevance).
- **LLM Synthesis**: Groq API (`llama-3.1-8b-instant`, low temperature for deterministic adherence).
- **Grounding Check**: Automated claim extraction and Natural Language Inference (NLI) entailment check per claim before releasing answers.

---

## 📊 Evaluation Benchmark Results

The pipeline is benchmarked against a standardized 26-question evaluation dataset spanning **In-Scope**, **Ambiguous**, **Out-of-Scope**, and **Adversarial** queries.

| Evaluation Metric | Score | Performance Details |
| :--- | :---: | :--- |
| **Abstention Accuracy** | **80.77%** | Precision across all queries requiring strict domain guardrails. |
| **Out-of-Scope Abstention** | **100% (6/6)** | Zero false positives on general knowledge, IT, or irrelevant queries. |
| **Adversarial Abstention** | **100% (4/4)** | Rejects non-existent specifications, fabricated protocols, and 6G concepts. |
| **Retrieval Recall** | **61.54%** | Retrieves target normative clauses for multi-spec technical queries. |
| **False Abstention Rate** | **19.23%** | Low false rejection rate on valid technical questions. |

*Detailed benchmark logs and per-question outputs can be reviewed in [`eval/results_log.md`](eval/results_log.md) and [`eval/results.json`](eval/results.json).*

---

## 🚀 Local Development Setup

### 1. Prerequisites
- Node.js (v18+)
- Supabase Project (with `pgvector` enabled)
- Groq API Key

### 2. Clone & Configure Environment
```bash
git clone https://github.com/AdityaTel89/3gpp_rag_chatbot.git
cd 3gpp-rag-chatbot
```

Create `.env` inside `backend/`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
GROQ_API_KEY=your-groq-api-key
PORT=3000
```

### 3. Database Migration
Run the SQL schema in `backend/supabase/schema.sql` inside your Supabase SQL Editor.

### 4. Ingest 3GPP Specifications
Place specification PDFs inside `data/raw/` and run the ingestion engine:

```bash
cd backend
npm install

# Ingest TS 23.501 (5G System Architecture)
npx tsx scripts/ingest.ts --pdf ../data/raw/TS23501.pdf --spec "TS 23.501" --release "Rel-17" --version "17.4.0"

# Ingest TS 38.300 (NR / NG-RAN Overall Description)
npx tsx scripts/ingest.ts --pdf ../data/raw/TS38300.pdf --spec "TS 38.300" --release "Rel-17" --version "17.5.0"
```

### 5. Start Application

#### Option A: Running with Dev Servers
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

#### Option B: Docker Compose
```bash
docker compose up --build
```
- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:3000`

### 6. Run Automated Evaluation Suite
```bash
cd backend
npm run eval
```

---

## ☁️ Production Deployment Guide

### A. Deploy Backend to Render

1. Create a free account at [render.com](https://render.com).
2. Click **New + > Web Service** and connect your GitHub repository.
3. Configure the service settings:
   - **Name**: `3gpp-rag-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. In **Environment Variables**, add:
   - `SUPABASE_URL`: `https://your-project.supabase.co`
   - `SUPABASE_SERVICE_KEY`: `your-supabase-service-role-key`
   - `GROQ_API_KEY`: `your-groq-api-key`
   - `PORT`: `10000`
5. Click **Create Web Service**. Once deployed, copy your public backend URL (e.g., `https://3gpp-rag-backend.onrender.com`).

---

### B. Deploy Frontend to Vercel

1. Create a free account at [vercel.com](https://vercel.com).
2. Click **Add New > Project** and import your GitHub repository.
3. Configure the build settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**, add:
   - `VITE_API_URL`: `https://3gpp-rag-backend.onrender.com` *(your Render backend URL)*
5. Click **Deploy**. Vercel will provide an SSL-secured production URL (e.g., `https://3gpp-rag-chatbot.vercel.app`).

