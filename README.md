# CodeMap

**AI-Powered Codebase Intelligence — Ask Questions, Get Answers**

> Point CodeMap at any repository and start querying your codebase in plain English. Powered by a local RAG pipeline, semantic vector search, and an LLM with function-calling — no data leaves your infrastructure.

---

## Overview

CodeMap is a full-stack developer tool that transforms static codebases into queryable, searchable knowledge bases. It indexes your source code using semantic embeddings, stores them in a local ChromaDB vector store, and answers natural-language queries via an agentic RAG pipeline backed by OpenAI's function-calling API.

Whether you're onboarding to a new codebase, hunting down where a specific pattern lives, or trying to understand a legacy system, CodeMap gives you an intelligent assistant that actually knows your code.

---

## Key Features

### Repository Management

- **Three ways to add a repository:**
  - **Upload a ZIP** — drag and drop any project archive
  - **Connect GitHub** — OAuth with GitHub to index your private repositories
  - **Paste a public repo URL** — link any public GitHub repo without authenticating (`https://github.com/owner/repo`, SSH, or `owner/repo` shorthand all accepted)
- View all connected repositories on a unified dashboard with status, language, size, and last-indexed time
- Real-time change detection — flags GitHub repos that have been pushed to since the last index
- Per-project re-indexing with live progress logs streamed to the UI
- Retry failed uploads using crash-safe recovery from Supabase Storage
- Remove repositories and wipe their vector data with a single action

### Agentic Query Interface

- Natural-language chat interface scoped to a selected project
- Agentic RAG pipeline with OpenAI function-calling — the LLM decides when to search vs. answer directly
- Returns source references with file path, chunk index, and relevance score
- Syntax-highlighted code panel opens automatically with the most relevant chunk
- Full chat history persisted per project in `localStorage` (up to 50 messages)
- Three-column IDE-like layout: file tree · chat · code viewer
  - All three panels are independently resizable by drag
  - File tree and code panel can be toggled open/closed

### Interactive File Tree

- Browse every indexed file in the selected project in a hierarchical tree
- Real-time search/filter with match highlighting
- Click any file to load its indexed content and chunks directly into the code panel
- Ancestors auto-expand when a file is selected via a query reference
- File count reflects the active filter

### Semantic Indexing Pipeline (Python / FastAPI)

- Smart language-aware chunking (AST-level for Python and JS/TS; heuristic fallback for others)
- Concurrent chunking with a thread pool worker, sequential embedding for stability
- Batch embeddings via `sentence-transformers` (configurable model: `all-MiniLM-L6-v2` → `all-mpnet-base-v2`)
- Content-hash deduplication — unchanged files are skipped on re-index
- ChromaDB persistent local vector store; collection isolated per project
- Supports up to 500 files per project, up to 250 KB per file
- Automatically filters: binary files, minified output, dependency dirs (`node_modules`, `dist`, `.venv`, `__pycache__`, etc.)

### Authentication & User Management

- Sign up / log in with email + password or Google OAuth
- Connect GitHub to an existing account for private repo access
- JWT access tokens (short-lived) + refresh tokens (HTTP-only cookie rotation)
- View and update profile: username, avatar URL, connected providers
- Account deletion with full data wipe
- Change password from the profile page

### Settings

- Light / Dark / System theme toggle (persisted)
- Toggle query history saving
- Clear all locally stored query history
- Push notification and email update preferences

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| **React 18 + TypeScript** | UI framework |
| **Vite** | Build tool & dev server |
| **React Router v6** | Client-side routing |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui (Radix UI)** | Accessible component primitives |
| **Lucide React** | Icon set |

### Backend (Node.js)

| Technology | Purpose |
|---|---|
| **Express + TypeScript** | HTTP server |
| **TypeORM** | ORM & database migrations |
| **PostgreSQL (Supabase)** | Primary database |
| **Supabase Storage** | Crash-safe ZIP holding area |
| **AdmZip** | In-memory ZIP extraction |
| **JWT + bcrypt** | Auth tokens & password hashing |
| **Multer** | Multipart file upload handling |
| **neverthrow** | Type-safe Result/Error pattern |

### RAG Pipeline (Python)

| Technology | Purpose |
|---|---|
| **FastAPI + uvicorn** | Async HTTP service |
| **sentence-transformers** | Local embedding model |
| **ChromaDB** | Persistent local vector store |
| **OpenAI API** | LLM with function-calling for agentic queries |
| **pytest** | Test suite (retrieval quality, isolation, large repo) |

---

## Architecture

```
┌─────────────┐     ZIP upload / GitHub OAuth      ┌──────────────────┐
│   Frontend  │ ──────────────────────────────────► │  Node.js Backend │
│  React+Vite │                                     │  Express / 5000  │
│             │ ◄─────────────── answers ─────────  │                  │
└─────────────┘                                     └────────┬─────────┘
                                                             │
                                          POST { file_path, content }[]
                                                             │
                                                    ┌────────▼─────────┐
                                                    │  Python RAG API  │
                                                    │  FastAPI / 5001  │
                                                    │                  │
                                                    │  chunk → embed   │
                                                    │  → ChromaDB      │
                                                    └──────────────────┘
```

**How ingestion works:**

1. User uploads a ZIP or triggers a GitHub re-index
2. Node.js downloads/extracts the archive and filters files in memory
3. Node.js POSTs raw file text to the Python service — Python never touches storage
4. Python chunks → embeds → upserts into ChromaDB
5. For uploaded ZIPs, the original archive is held in Supabase Storage as a crash-safe backup; deleted immediately after a successful index

**How querying works:**

1. User types a question in the chat interface
2. Node.js forwards the query to the Python RAG service
3. Python embeds the query, runs a semantic search against ChromaDB, and passes relevant chunks to the OpenAI LLM via function-calling
4. The answer + source references are returned and rendered in the UI

---

## Project Structure

```
CodeMap/
├── docker-compose.yml          # Production deployment (both services)
│
├── backend/                    # Node.js / Express API
│   ├── Dockerfile
│   ├── src/
│   │   ├── app.ts              # Express app setup
│   │   ├── server.ts           # Entry point
│   │   ├── config/             # Config & TypeORM datasource
│   │   ├── integrations/
│   │   │   └── supabase/       # Storage client
│   │   ├── middleware/         # Auth, origin, CSRF guards
│   │   └── modules/
│   │       ├── auth/           # Signup, login, OAuth (Google + GitHub)
│   │       ├── user/           # Profile, GitHub repo listing, account deletion
│   │       ├── project/        # ZIP upload, public repo linking, retry ingest
│   │       ├── reindex/        # GitHub repo re-index jobs with live logs
│   │       └── query/          # Proxy to Python RAG service
│   └── tests/                  # Integration tests
│
├── rag-pipeline/               # Python / FastAPI RAG service
│   ├── Dockerfile
│   ├── app.py                  # FastAPI app + lifespan (model warmup)
│   ├── config.py               # Env config
│   ├── constants.py            # Shared constants
│   ├── routers/
│   │   ├── ingest.py           # POST /ingest
│   │   ├── query.py            # POST /query
│   │   └── projects.py         # GET files, GET file content, DELETE vectors
│   ├── services/
│   │   ├── embedder.py         # Chunking, embedding, ChromaDB upsert/query
│   │   ├── chunker.py          # Language-aware smart chunking
│   │   ├── rag_service.py      # Agentic LLM + function-calling
│   │   ├── ingest_service.py   # Per-project concurrency locking
│   │   └── query_service.py    # Query orchestration
│   ├── models/schemas.py       # Pydantic request/response models
│   ├── chroma_db/              # Persisted vector store (gitignored)
│   └── tests/                  # Retrieval quality, isolation, large-repo tests
│
└── frontend/                   # React + Vite SPA
    ├── src/
    │   ├── pages/
    │   │   ├── Landing.tsx     # Marketing / home page
    │   │   ├── Dashboard.tsx   # Repo management hub
    │   │   ├── Query.tsx       # Chat + file tree + code panel
    │   │   ├── Profile.tsx     # User profile & GitHub connect
    │   │   ├── Settings.tsx    # Theme, privacy, danger zone
    │   │   ├── Login.tsx
    │   │   └── Signup.tsx
    │   ├── components/
    │   │   ├── LogoHomeLink.tsx
    │   │   └── MarkdownAnswer.tsx
    │   ├── services/api.ts     # Typed API client
    │   ├── types/api.ts        # Shared TypeScript types
    │   └── lib/theme.ts        # Light/dark/system theme
    └── public/
        └── codemap.svg
```

---

## Getting Started

### Prerequisites

- **Node.js** v20+
- **Python** 3.11+
- **PostgreSQL** (or a Supabase project)
- **OpenAI API key**
- **Docker + Docker Compose** (for containerised deployment)

---

### Option A — Docker Compose (Recommended)

```bash
git clone https://github.com/mamoon-17/CodeMap.git
cd CodeMap
```

Fill in the two `.env` files:

**`backend/.env`**
```env
SUPABASE_URI=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
PORT=5000
FRONTEND_URL=http://localhost:5173
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

**`rag-pipeline/.env`**
```env
OPENAI_API_KEY=...
PORT=5001
FLASK_ENV=production
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

Then:

```bash
docker compose up --build
```

- Node.js backend → `http://localhost:5000`
- Python RAG service → `http://localhost:5001`
- ChromaDB data persisted in a named Docker volume (`codemap-chroma-data`)

---

### Option B — Local Development

**1. Backend**

```bash
cd backend
npm install
# add backend/.env (see above)
npm run dev
```

**2. RAG Pipeline**

```bash
cd rag-pipeline
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
# add rag-pipeline/.env (see above)
python app.py
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev
```

- Frontend → `http://localhost:5173`
- Backend → `http://localhost:5000`
- RAG service → `http://localhost:5001`

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URI` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL (for Storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `PORT` | Backend port (default `5000`) |
| `FRONTEND_URL` | CORS allowed origin |
| `JWT_ACCESS_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `RAG_SERVICE_URL` | Python service URL (default `http://localhost:5001`) |

### RAG Pipeline (`rag-pipeline/.env`)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `PORT` | FastAPI port (default `5001`) |
| `FLASK_ENV` | `development` or `production` |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` (fast) or `all-mpnet-base-v2` (best) |

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/signup` | Register with email + password |
| `POST` | `/auth/login` | Login, returns access token |
| `POST` | `/auth/refresh` | Rotate access token via refresh cookie |
| `POST` | `/auth/logout` | Invalidate refresh token |
| `GET` | `/auth/google` | Start Google OAuth flow |
| `GET` | `/auth/github/connect` | Connect GitHub to an existing account |

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/users/me` | Get current user profile |
| `PATCH` | `/users/me` | Update username / avatar URL |
| `DELETE` | `/users/me` | Delete account |
| `POST` | `/users/change-password` | Change password |
| `GET` | `/users/repos` | List GitHub repos (requires connected account) |

### Projects (Uploaded ZIPs)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/projects` | List all uploaded projects |
| `POST` | `/projects/upload` | Upload and index a ZIP archive |
| `POST` | `/projects/:id/retry` | Retry a failed index from stored ZIP |
| `DELETE` | `/projects/:id` | Delete project and its vectors |
| `GET` | `/projects/:id/files` | List all indexed file paths |
| `GET` | `/projects/:id/files/content` | Fetch indexed chunks for a file |

### Public Repos

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/projects/public-repos` | Link a public GitHub repo by URL |
| `GET` | `/projects/public-repos` | List linked public repos |
| `DELETE` | `/projects/public-repos/:id` | Remove a public repo link |

### Re-index (GitHub)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/reindex` | Start a re-index job for a GitHub repo |
| `GET` | `/reindex/:jobId` | Poll job status + logs |

### Query

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/query` | Ask a natural-language question about a project |

---

## Supported File Types

`.js` `.ts` `.py` `.java` `.cpp` `.c` `.cs` `.go` `.rb` `.php` `.swift` `.kt` `.rs` `.html` `.css` `.json` `.xml` `.yaml` `.yml`

Files are automatically excluded if they are: binary, over 250 KB, or inside ignored directories (`node_modules`, `dist`, `build`, `.next`, `.venv`, `__pycache__`, `.git`, etc.)

---

## Embedding Models

| Model | Size | Speed | Quality |
|---|---|---|---|
| `all-MiniLM-L6-v2` | 22 MB | ⚡ Fastest | Good |
| `all-MiniLM-L12-v2` | 33 MB | Fast | Better |
| `all-mpnet-base-v2` | 420 MB | Slower | Best |

Set `EMBEDDING_MODEL` in `rag-pipeline/.env` to switch. The model is downloaded automatically on first run and cached locally.

---

## Security

- JWT access tokens with short expiry; refresh tokens stored in HTTP-only cookies
- Origin header validation on sensitive auth endpoints
- `X-Requested-With` header required on state-changing auth routes (CSRF mitigation)
- ZIP path traversal protection (rejects `../`, absolute paths, null bytes, Windows drive paths)
- Binary file heuristic detection prevents embedding minified or compiled blobs
- Per-project collection isolation in ChromaDB — queries are always scoped to one project

---

## License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  <strong>CodeMap</strong> — Your codebase, made searchable.
</p>
