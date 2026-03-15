# CodeMap AI Service

Python FastAPI service responsible for the RAG pipeline —
chunking, embedding generation, vector storage and semantic search.

## Tech Stack
- FastAPI — REST API framework
- sentence-transformers — local embedding model (all-MiniLM-L6-v2)
- ChromaDB — local vector database (embedded, no separate server needed)
- SQLAlchemy — PostgreSQL ORM (available for future use)
- Supabase PostgreSQL — shared database with backend (future use)

## How It Works

### Ingestion Flow
```
Node.js extracts uploaded zip to temp folder
        ↓
Node.js reads each file's content into memory
        ↓
Node.js sends file contents to POST /ingest:
{
    "project_id": "123",
    "files": [
        {"file_path": "src/auth.py", "content": "..."},
        {"file_path": "src/user.py", "content": "..."}
    ]
}
        ↓
For each file → chunk_file() splits into 100 line chunks
                with 20 line overlap
        ↓
For each chunk → all-MiniLM-L6-v2 generates 384 dimension vector
        ↓
Vector + metadata stored in ChromaDB collection project_{id}
        ↓
Returns {"indexed": total_chunk_count} to Node.js
        ↓
Node.js deletes temp folder
Node.js updates project status to READY in Supabase
```

## Project Structure
```
ai-service/
├── main.py                 entry point, registers all routers
├── requirements.txt        python dependencies
├── .env                    environment variables (not committed)
├── routers/
│   └── ingest.py           POST /ingest endpoint
├── services/
│   ├── chunker.py          splits file content into overlapping chunks
│   └── embedder.py         generates embeddings, stores in ChromaDB
└── models/
    ├── db_models.py        SQLAlchemy Chunk model (future use)
    └── schemas.py          Pydantic request/response schemas
```

## API Endpoints
- GET  /health    confirm service is running
- POST /ingest    chunk, embed and store files in ChromaDB

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Create .env file
```
DATABASE_URL=your_supabase_connection_string
```

### 3. Run the service
```bash
uvicorn main:app --reload --port 8001
```

### 4. Test health endpoint
```
http://localhost:8001/health
```

### 5. API Documentation
```
http://localhost:8001/docs
```

## ChromaDB Storage
Vectors are stored locally in the `chroma_db/` folder.
This folder is gitignored and persists between server restarts.
Each project gets its own isolated collection named `project_{project_id}`.

## Notes
- Embedding model (all-MiniLM-L6-v2) loads once at startup
- ChromaDB runs embedded inside this service, no separate server needed
- db.py and db_models.py are kept for future PostgreSQL integration
- In production, file contents would be served from S3 instead of 
  being sent directly over HTTP
