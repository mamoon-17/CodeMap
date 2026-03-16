# Ingest to Query Flow (Node -> Python RAG)

This document describes the integration flow where ingestion happens on Python RAG service and querying starts from Node backend `/query`.

## End-to-End Sequence

1. Node/backend (or test client) sends file content to Python RAG `/ingest`.
2. Python RAG chunks file content and stores embeddings in ChromaDB.
3. Client calls Node backend `/query`.
4. Node backend forwards request to Python RAG `/query`.
5. Python RAG decides tool usage, retrieves chunks from vector DB, and returns answer + sources.
6. Node backend returns that response to client.

## Endpoint Inputs and Outputs

## 1) Python RAG: `POST /ingest`

Request body:

```json
{
  "project_id": "project-123",
  "files": [
    {
      "file_path": "src/example.py",
      "content": "def hello():\n    return 'world'"
    }
  ]
}
```

Response body:

```json
{
  "indexed": 1
}
```

Notes:

- `file_path` is source metadata for attribution.
- `content` must be full text for that file to index all lines.
- Chunk boundaries (`start_line`, `end_line`) are computed in Python chunker.

## 2) Node Backend: `POST /query`

Request body:

```json
{
  "project_id": "project-123",
  "query": "Where is hello() implemented?",
  "top_k": 5
}
```

Response body (typical):

```json
{
  "query": "Where is hello() implemented?",
  "answer": "...",
  "tool_used": true,
  "sources": [
    {
      "file": "src/example.py",
      "chunk_index": 1,
      "score": 0.91,
      "text": "def hello():\n    return 'world'"
    }
  ]
}
```

Error statuses:

- `400` for invalid payload (e.g., empty query or invalid `top_k`)
- `429` for upstream LLM rate limit
- `502` for Python service upstream errors (mapped by backend)

## Running the Integration Test

Prerequisites:

- Python RAG running on `http://localhost:5001`
- Node backend running on `http://localhost:5000`

Command:

```bash
cd backend
npm run test:ingest-query
```

Test file:

- `backend/tests/ingest-query.integration.spec.js`

---

## Manual Frontend Testing (Ingest + Query)

Use this when you want to test the full flow yourself in the UI instead of running the E2E script.

### 1) Start services

In terminal 1:

```bash
cd rag-pipeline
.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 5001 --env-file .env
```

In terminal 2:

```bash
cd backend
npm run dev
```

In terminal 3:

```bash
cd frontend
npm run dev
```

### 2) Open UI

- Open `http://localhost:5173/query`

### 3) Ingest from the Query page

- In the **Manual Ingest (RAG)** panel, fill:
  - `Project ID` (example: `manual-project`)
  - `File path` (example: `src/manual_test.py`)
  - `File content` (paste full source text)
- Click **Ingest File**.
- Manual UI ingest replaces the currently indexed contents for that project ID, so old files from earlier manual tests do not linger.
- Confirm success message: `Ingested successfully. Indexed chunks: ...`

### 4) Query from the same page

- Use the same `Project ID` value you ingested under. The query UI now sends that value with each search.
- Ask a question referencing the code you ingested.
- Example: `Where is manual_test_helper defined and what does it return?`
- You should receive:
  - Answer text from the backend + RAG service
  - Referenced source chunks in the UI

### 5) Optional env overrides (frontend)

If your services run on non-default ports, add these in frontend env:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_RAG_BASE_URL=http://localhost:5001
```
