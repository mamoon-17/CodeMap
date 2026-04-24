# CodeMap RAG Pipeline (Python / FastAPI)

This folder contains the **RAG service** (FastAPI) used for:

- **Ingestion**: chunk + embed repository files into ChromaDB
- **Querying**: agentic RAG (LLM decides whether to retrieve chunks, then answers with sources)

## Prereqs

- **Python 3.14 is supported** (Windows)

Notes:

- This project depends on **Pydantic v2**, which requires `pydantic-core` (a compiled wheel). If `pip` ever tries to *build* `pydantic-core` from source and complains about `link.exe`, it means your Pydantic version is too old for your Python version. Use the versions in `requirements.txt` (they’re set to pull a wheel for Python 3.14).

## Setup (Windows PowerShell)

From the repo root:

```powershell
cd .\rag-pipeline
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r .\requirements.txt
```

If installs ever get into a weird state, recreate the venv:

```powershell
deactivate
Remove-Item -Recurse -Force .\.venv
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r .\requirements.txt
```

If activation fails with an execution policy error, run this once (PowerShell as your user) and try again:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Environment variables

Create a `.env` file inside `rag-pipeline/` (same folder as `app.py`) with at least:

```env
OPENAI_API_KEY=your_key_here
PORT=5001
FLASK_ENV=development
```

Notes:

- `OPENAI_API_KEY` is required (the service logs missing config on startup if it’s not set).
- `PORT` defaults to `5001` if not provided.

## Run the server (Uvicorn)

From `rag-pipeline/` with the venv activated:

```powershell
python -m uvicorn app:app --host localhost --port 5001 --reload
```

If you set `PORT` in `.env`, you can keep the command consistent by matching it:

```powershell
python -m uvicorn app:app --host localhost --port $env:PORT --reload
```

Quick verification:

```powershell
curl.exe -s http://localhost:5001/health
```

Open docs in your browser:

- Swagger UI: `http://localhost:5001/docs`
- ReDoc: `http://localhost:5001/redoc`

## Useful endpoints

- **Health**: `GET /health`
- **Ingest**: `POST /ingest`
- **Query**: `POST /query`

## Dev notes

- The vector store is persisted locally via Chroma at `./chroma_db` (relative to where the service runs).
- Ingestion expects a list/array of files where each item includes:
  - `file_path` (string, can include directories like `src/app.ts`)
  - `content` (string, the file text)

