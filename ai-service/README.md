# CodeMap AI Service

Python FastAPI service responsible for the RAG pipeline — chunking, embedding generation, vector storage and semantic search.

## Tech Stack
- FastAPI — REST API framework
- sentence-transformers — local embedding model (all-MiniLM-L6-v2)
- ChromaDB — local vector database
- SQLAlchemy — PostgreSQL ORM
- Supabase PostgreSQL — shared database with backend

## Project Structure
```
ai-service/
├── main.py               entry point
├── routers/              API endpoints
│   ├── embed.py          POST /embed
│   └── search.py         POST /search (coming soon)
├── services/             business logic
│   ├── embedder.py       embedding generation + ChromaDB storage
│   ├── chunker.py        code chunking logic
│   └── db.py             database connection
└── models/
    ├── db_models.py      SQLAlchemy Chunk model
    └── schemas.py        request/response schemas
```

## Setup

1. Install dependencies
pip install -r requirements.txt

2. Create .env file
DATABASE_URL=your_supabase_connection_string

3. Run the service
uvicorn main:app --reload --port 8001

## API Endpoints
- GET  /health   confirm service is running
- POST /embed    generate embeddings for chunks and store in ChromaDB