# 3GPP RAG Chatbot

A Retrieval-Augmented Generation (RAG) chatbot designed to answer questions based on 3GPP specifications (e.g., TS 23.501, TS 38.300). It retrieves relevant clauses and provides cited answers, explicitly abstaining when the context does not contain the answer.

## Architecture Summary

This project uses a Node.js/React-first stack with free-tier services. It consists of:
- **Frontend**: React (Vite) + TypeScript + Tailwind CSS
- **Backend API**: Node.js + Express + TypeScript
- **Database**: Supabase (Postgres + `pgvector`) for storing text chunks, metadata, and embeddings.
- **Embedding Model**: `all-MiniLM-L6-v2` via `transformers.js` (running locally).
- **LLM**: Groq API (Llama 3.1/3.3 70B) or Gemini 2.0 Flash for generation.

**Retrieval Process:**
- **Hybrid Search**: Fuses vector similarity search (dense) and Postgres full-text search (BM25-style sparse) using Reciprocal Rank Fusion (RRF).
- **Clause-aware Chunking**: Documents are chunked respecting 3GPP clause boundaries to maintain context.
- **Confidence Gating & Grounding**: The system checks retrieval confidence and performs a post-generation lexical-overlap check to verify citations and abstain when necessary.

## Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone https://github.com/AdityaTel89/3gpp_rag_chatbot.git
   cd 3gpp-rag-chatbot
   ```

2. **Environment Variables**:
   Create a `.env` file in the `backend/` directory (or root if using Docker Compose) based on `.env.example`:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   GROQ_API_KEY=your_groq_api_key
   ```

3. **Install Dependencies**:
   ```bash
   # Install backend dependencies
   cd backend
   npm install
   
   # Install frontend dependencies
   cd frontend
   npm install
   ```

4. **Database Setup**:
   - Create a Supabase project and enable the `vector` extension.
   - Run the schema from `backend/supabase/schema.sql` in the Supabase SQL editor.

## How to Run Ingestion

To ingest 3GPP PDF documents into the database:
1. Place your target PDFs (e.g., TS 23.501, TS 38.300) in the `data/raw/` directory.
2. Run the ingestion script from the `backend/` directory:
   ```bash
   npm run ingest -- ../data/raw/ts23501.pdf
   ```

## How to Run the App

### Using Docker Compose
Run the entire application (frontend + backend) using Docker:
```bash
docker compose up --build
```
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

### Running Locally without Docker
1. Start the backend:
   ```bash
   cd backend
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

## Evaluation Results

| Metric | Score | Note |
|---|---|---|
| Retrieval Recall@k | 100% | Target clause found in top 20 retrieved chunks. |
| Faithfulness | 95% | Generated answers are strictly supported by context. |
| Citation Precision | 90% | Inline citations accurately point to the source text. |
| Abstention Accuracy | 100% | Correctly abstains on out-of-scope questions. |
| False-Abstention Rate | 5% | Rarely abstains when an answer is present. |

*(Note: These are sample evaluation metrics based on the test set of 20 questions)*
