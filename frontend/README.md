# 3GPP RAG Chatbot - Frontend

This is the frontend application for the 3GPP RAG Chatbot, built with React, Vite, TypeScript, and Tailwind CSS.

## Features
- **Chat Interface**: Single-page UI for submitting questions to the RAG backend.
- **Citation Chips**: Clickable inline citations pointing to specific 3GPP specs, clauses, and pages.
- **Abstention Banner**: Visually distinct state indicating when the system abstains due to low confidence or missing context.

## Setup and Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Environment
Ensure the backend API is running locally (default: `http://localhost:3001`) or configured via your environment setup in Docker.
