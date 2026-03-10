# Mock Embedding Service

Lightweight Flask service that returns mock code chunks for testing the CodeMap RAG pipeline.

## Purpose

This service simulates a vector database + embedding service without requiring:
- Heavy ML model downloads (sentence-transformers)
- External vector DB setup (Pinecone, Weaviate, etc.)
- Real code indexing

**Note:** This is for development/testing only. Replace with a real vector DB service in production.

## Structure

```
mock-service/
├── app.py              # Flask service with mock chunks
├── requirements.txt    # Just Flask
└── .venv/             # Python virtual environment (auto-created)
```

## Setup

### First Time Setup
```bash
cd mock-service
python -m venv .venv
# Windows
.venv\Scripts\Activate
# macOS/Linux  
source .venv/bin/activate

pip install -r requirements.txt
```

### Running the Service
```bash
# Activate environment (if not already active)
.venv\Scripts\Activate  # Windows
source .venv/bin/activate  # macOS/Linux

# Start service
python app.py
```

Service will run on `http://localhost:5001`

## API Endpoints

### GET /health
Health check

**Response:**
```json
{
  "status": "ok",
  "service": "mock-embedding"
}
```

### POST /query
Retrieve mock code chunks

**Request:**
```json
{
  "query": "Where is authentication handled?",
  "top_k": 5
}
```

**Response:**
```json
{
  "query": "Where is authentication handled?",
  "results": [
    {
      "id": "chunk_001",
      "score": 0.92,
      "metadata": {
        "file": "src/auth/authController.js",
        "chunk_index": 3,
        "text": "..."
      }
    }
  ]
}
```

## Mock Data

The service returns 5 hardcoded chunks:
1. Login endpoint (`src/auth/authController.js`)
2. Auth middleware (`src/auth/middleware.js`)
3. User schema (`src/models/User.js`)
4. Register endpoint (`src/auth/authController.js`)
5. Passport config (`src/config/passport.js`)

## Configuration

Environment variables:
- `PORT` - Service port (default: 5001)

## Replacing with Real Service

In production, replace this with:
1. Real embedding model (sentence-transformers, OpenAI, etc.)
2. Vector database (Pinecone, Weaviate, Qdrant, FAISS)
3. Code indexing pipeline
4. Authentication/authorization

The backend expects the same API contract (`POST /query` with `results` array).
