# CHUNKING & EMBEDDING PIPELINE

## 1. Overview

This pipeline turns raw source code files into a searchable vector index. When a developer uploads a project to CodeMap, every text file is broken into **smaller, meaningful pieces (chunks)**, each piece is converted into a numerical fingerprint (an **embedding vector**), and those vectors are stored in **ChromaDB**, a local persistent vector database. Later, when the user asks a natural-language question (e.g. "where is authentication handled?"), the question is also turned into a vector and ChromaDB returns the chunks whose vectors are closest in meaning. Those chunks are then handed to the LLM to write a final answer.

**Where this pipeline fits in CodeMap.** The Node.js backend handles auth, project metadata, and file uploads. After a repo is uploaded, the backend POSTs the file contents to this Python service (the "RAG pipeline") via `POST /ingest`. From that point on, this service owns chunking, embedding, persistence, and retrieval. The Node.js side never sees vectors.

**End-to-end journey of a single file.** Raw text comes in via the API → it is dispatched to the right chunker (Python AST, JS regex, or naive line-window) → each chunk gets a `language` label and inherits a SHA-256 hash of the whole file (`file_hash`) → the chunk's text is fed to a `SentenceTransformer` model that returns a 384-dim vector → the vector, the chunk text, and rich metadata are upserted into a per-project ChromaDB collection. On a later re-ingestion of the same file, the saved `file_hash` lets the pipeline skip unchanged files entirely instead of re-embedding them.

---

## 2. Files And Their Roles

| File | Role |
|---|---|
| `services/chunker.py` | Splits raw file content into semantically meaningful chunks. Knows about Python ASTs, JS/TS regex patterns, and naive line-window fallback. Also detects the chunk's language from the file extension. |
| `services/embedder.py` | Loads the embedding model and ChromaDB client. Owns `ingest_and_embed()` (write path), `retrieve_similar_chunks()` (read path), and the file-hash dedup logic. |
| `models/schemas.py` (`IngestInput`, `FileInput`, `IngestResponse`) | Pydantic request/response schemas for the ingest endpoint. Defines what the Node.js backend must send and what it gets back. |
| `routers/ingest.py` | FastAPI router exposing `POST /ingest`. A thin layer that hands the validated request to the controller. |

---

## 3. API Endpoint

### `POST /ingest`

**What it does.** Accepts a project's files, chunks them, embeds them, and stores the vectors in ChromaDB under a per-project collection. Returns the number of chunks that were indexed.

**Request body schema (`IngestInput`)**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `project_id` | `str` | Yes | — | Logical project identifier. Becomes the suffix of the ChromaDB collection name (`project_<project_id>`). |
| `files` | `list[FileInput]` | Yes | — | List of files to ingest. Each file has `file_path` and `content`. |
| `replace_project` | `bool` | No | `false` | If `true`, the entire project's collection is dropped and recreated before ingestion (full re-index). If `false`, files are upserted incrementally and unchanged files are skipped. |

**`FileInput`**

| Field | Type | Description |
|---|---|---|
| `file_path` | `str` | Path of the file as it should appear in metadata (relative path from repo root is conventional). |
| `content` | `str` | UTF-8 text content of the file. |

**Response schema (`IngestResponse`)**

| Field | Type | Description |
|---|---|---|
| `indexed` | `int` | Total number of chunks written to ChromaDB across all files in this request. |

> **Note on `skipped_files`.** Internally, `ingest_and_embed()` also returns a `skipped_files` count (files unchanged since last ingest, based on `file_hash`). The current `IngestResponse` schema only surfaces `indexed`, so `skipped_files` is computed but **not exposed via the API**. To surface it, add `skipped_files: int = 0` to `IngestResponse` and forward it in `IngestService.ingest()`.

**Example request**

```json
{
  "project_id": "demo-repo-42",
  "replace_project": false,
  "files": [
    {
      "file_path": "src/auth/login.py",
      "content": "import hashlib\n\ndef hash_password(pw: str) -> str:\n    return hashlib.sha256(pw.encode()).hexdigest()\n\nclass LoginService:\n    def __init__(self, store):\n        self.store = store\n\n    def login(self, user, pw):\n        record = self.store.find(user)\n        return record and record.pw_hash == hash_password(pw)\n"
    },
    {
      "file_path": "src/utils/strings.js",
      "content": "export function slugify(s) {\n  return s.toLowerCase().replace(/\\s+/g, '-');\n}\n\nexport const truncate = (s, n) => s.length > n ? s.slice(0, n) + '...' : s;\n"
    }
  ]
}
```

**Example response**

```json
{ "indexed": 3 }
```

**What happens internally, step by step**

1. FastAPI deserializes and validates the body against `IngestInput`.
2. `routers/ingest.py` calls `handle_ingest(data)` in `controllers/ingest_controller.py`.
3. The controller calls `IngestService.ingest(request)` in `services/ingest_service.py`.
4. The service calls `ingest_and_embed(request.files, request.project_id, replace_project=request.replace_project)` in `services/embedder.py`.
5. If `replace_project` is `true`, the existing Chroma collection is deleted (`_reset_project_collection`).
6. The collection `project_<project_id>` is fetched (or created).
7. For each file:
   - Compute `file_hash = sha256(file.content)`.
   - Query Chroma for one existing chunk of that `file_path`. If its stored `file_hash` matches, increment `skipped_count` and continue.
   - If `replace_project` is `false`, delete any prior chunks for that `file_path` (so we never leave stale chunks behind).
   - Call `smart_chunk_file(file_path, file_content)` → list of chunks.
   - For each chunk, compute its embedding with the SentenceTransformer model and upsert into Chroma with rich metadata.
8. Return `{"indexed": total_chunks, "skipped_files": skipped_count}`. The controller currently only forwards `indexed` in the HTTP response.

---

## 4. Chunking System

### Plain-English primer

**What chunking is.** Embedding models have a fixed input length (typically a few hundred tokens). A whole file usually exceeds that. Even when it doesn't, embedding a giant blob produces a single average vector that captures nothing specific — searches return whole files, not the relevant function. So we split each file into small, focused pieces and embed each one independently.

**Why overlap matters.** If you cut at line 100 exactly, a function spanning lines 95–110 gets sliced into two chunks that each contain only half the function. Neither chunk is semantically complete, and the search will return one half without context. **Overlap** means the next chunk starts a few lines *before* the previous one ended, so important constructs spanning a boundary appear in full inside at least one chunk.

**Smart vs naive chunking.** Naive chunking just walks down the file in fixed line windows (e.g. 100 lines per chunk, 20-line overlap). It works, but it cuts mid-function and mid-class. **Smart chunking** uses language structure (Python AST, JS regex) to align chunk boundaries with function/class boundaries — each chunk becomes a coherent code unit, which dramatically improves retrieval quality.

---

### `chunk_file(file_path, content, chunk_size=100, overlap=20)`

Naive line-window chunker. Used directly for unsupported languages and as a fallback for Python files with syntax errors and JS files with no recognizable patterns.

**Parameters**

| Name | Type | Default | Controls |
|---|---|---|---|
| `file_path` | `str` | — | Stored on each chunk as `file_path`; also passed to `detect_language()` for the `language` label. |
| `content` | `str` | — | Raw file text. |
| `chunk_size` | `int` | `100` | Maximum number of lines per chunk. |
| `overlap` | `int` | `20` | How many lines from the end of one chunk should reappear at the start of the next. Must be strictly less than `chunk_size`. |

**Validation** raises `ValueError` if:
- `chunk_size` is not a positive integer
- `overlap` is not a non-negative integer
- `overlap >= chunk_size`

**`_is_semantic_boundary(line)`.** A line counts as a "good place to cut" if its stripped form is one of:
- empty (`""`)
- starts with `def `
- starts with `async def `
- starts with `class `

**Improved overlap strategy.** A naive overlap always restarts exactly `overlap` lines earlier. That can cut right through a function header. This implementation does better: after computing `overlap_start = end - overlap`, it scans **backwards** from there toward the previous chunk's start and stops at the first semantic boundary it finds. The next chunk starts there. If no boundary is found (or the boundary would land at or before `start`), it falls back to `start + step` to guarantee forward progress.

**ASCII view of how chunks overlap**

```
File lines:  1 2 3 4 5 6 7 8 9 10 11 12 ... 100 101 102 ... 110 ...
                                                |
Chunk 1: [..............................................]   (lines 1..100)
                                       ↑
                            scan back to nearest blank / def / class
                                       |
Chunk 2:                                [...........................]   (lines ~85..184)
                                                   overlap region
```

The chunks share a stretch of lines so that any function, class, or stanza that crosses the cut appears intact in at least one chunk.

**Returned chunk shape**

```python
{
  "text": "<chunk text including line endings>",
  "file_path": "src/auth/login.py",
  "start_line": 1,           # 1-indexed inclusive
  "end_line": 100,           # 1-indexed inclusive
  "language": "python",
}
```

---

### `smart_chunk_file(file_path, content, max_chunk_size=150)`

Top-level dispatcher. Picks a chunking strategy based on the file extension, with safe fallbacks if the structural strategy can't be applied.

**Strategy selection (in order)**

1. If `file_path.endswith((".js", ".jsx", ".ts", ".tsx"))` → `chunk_js_file(...)`.
2. Else if not `.py` → `chunk_file(...)` (naive).
3. Else (`.py`):
   - Try `ast.parse(content)`.
   - On `SyntaxError` → `chunk_file(...)` (naive fallback so the file is not dropped from the index).
   - Walk `tree.body`. For every top-level `FunctionDef`, `AsyncFunctionDef`, or `ClassDef`, record a `(start_line, end_line)` span.
     - **Decorators are included.** If the node has a `decorator_list`, `start_line` is set to the smallest decorator line so the chunk reflects the source as a developer would read it.
   - If no spans were found (flat script with only module-level statements) → `chunk_file(...)`.

**Gap emission.** Spans cover only function/class bodies. The lines *between* spans (imports, constants, top-level expressions) are called **gaps**. They are emitted as their own chunks via `_emit_gap(...)`. Without this, top-level constants and imports would be invisible to retrieval.

**Oversized blocks.** A function or class that exceeds `max_chunk_size` lines is re-chunked with `chunk_file(...)` operating on just that block; the sub-chunks' line numbers are then **rebased** so they reference positions in the original file (`sub["start_line"] + start_line - 1`).

**Naive vs smart chunking on the same Python file**

Source (`auth.py`, 24 lines):

```python
import os
import hashlib

SECRET = os.getenv("SECRET", "x")

def hash_password(pw: str) -> str:
    return hashlib.sha256((pw + SECRET).encode()).hexdigest()

class LoginService:
    def __init__(self, store):
        self.store = store

    def login(self, user, pw):
        record = self.store.find(user)
        if not record:
            return False
        return record.pw_hash == hash_password(pw)

def main():
    pass

if __name__ == "__main__":
    main()
```

| Strategy | Chunks produced |
|---|---|
| Naive (`chunk_file`) | 1 chunk of 24 lines (since the file is < `chunk_size=100`). The whole file gets one vector — searches will return the entire file even if the question is "how does login work". |
| Smart (`smart_chunk_file`) | 1 gap chunk (lines 1–4: imports + `SECRET`), 1 chunk for `hash_password` (lines 6–7), 1 chunk for `LoginService` (lines 9–17), 1 chunk for `main` (lines 19–20), 1 trailing gap chunk (lines 22–24). Five focused vectors instead of one blurry one. |

---

### `chunk_js_file(file_path, content, max_chunk_size=150)`

Structure-aware chunker for JS/TS, analogous to the Python AST path but using regex (Python has no built-in JS parser, and adding `tree-sitter`/`esprima` was deemed not worth the dependency cost).

**Regex pattern (multiline)**

```
^(export\s+)?(default\s+)?(async\s+)?
(function\s+\w+|class\s+\w+|
 const\s+\w+\s*=\s*(async\s*)?\(|
 let\s+\w+\s*=\s*(async\s*)?\()
```

What each piece matches:

| Sub-pattern | Matches |
|---|---|
| `(export\s+)?` | optional `export ` modifier |
| `(default\s+)?` | optional `default ` modifier |
| `(async\s+)?` | optional `async ` modifier |
| `function\s+\w+` | `function name(...)` declarations |
| `class\s+\w+` | `class Name {...}` declarations |
| `const\s+\w+\s*=\s*(async\s*)?\(` | `const name = (...)` and `const name = async (...)` arrow functions |
| `let\s+\w+\s*=\s*(async\s*)?\(` | same as above with `let` |

`re.MULTILINE` makes `^` match the start of any line, not just the start of the file.

**Char-offset → line-number conversion.** Regex matches return character offsets, but chunks are emitted in line ranges. The function builds `char_to_line[i] = i` (one entry per line, holding that line's 0-based index) — a flat list whose length equals the number of lines. For each match, `m.start()` is clamped to the list bounds and used as an index, yielding the line on which the match begins.

**Building split points.** Each match position is converted to its line number, deduplicated and sorted. The list is then bracketed with `0` (start of file) and `len(lines)` (end of file) so consecutive pairs cover the entire file with no gaps.

**Per-block emission.** For each consecutive pair `(s, e)`:

- `block = lines[s:e]` joined back into text.
- If empty/whitespace, skip.
- If `(e - s) > max_chunk_size`, hand the block to `chunk_file(...)` and rebase the resulting sub-chunks' line numbers to file coordinates.
- Otherwise emit the block as a single chunk with `start_line = s + 1`, `end_line = e`.

**Fallback.** If `pattern.finditer(content)` returns no matches (rare for hand-written app code, common for minified bundles), the function falls back to `chunk_file(...)`. There is no separate "syntax error" branch because there is no parse step that can fail.

**Known limitations** (intentional 80/20 trade-offs):

- Object-method shorthand inside object literals (`{ foo() { ... } }`)
- Generator functions (`function*`)
- Decorators
- `var`-declared functions
- `function` expressions assigned to `const`/`let` without arrow syntax (e.g. `const x = function() {}`)
- `.mjs`, `.cjs`, `.mts`, `.cts` extensions are not routed here — they fall through to the naive chunker. Adding them is a one-line change in `smart_chunk_file()`'s tuple if needed.

---

### `detect_language(file_path)`

Maps the file extension to a normalized language label used both as chunk metadata and as the value the search API filters by.

| Extension | Returned label |
|---|---|
| `.py` | `python` |
| `.js` | `javascript` |
| `.ts` | `typescript` |
| `.java` | `java` |
| `.cpp`, `.cc`, `.cxx` | `cpp` |
| `.c` | `c` |
| `.go` | `go` |
| `.rs` | `rust` |
| `.rb` | `ruby` |
| `.php` | `php` |
| anything else (incl. `.jsx`, `.tsx`, `.md`, `.json`, `.html`, ...) | `unknown` |

> **Subtle but important:** `.jsx` and `.tsx` are *structurally* chunked by `chunk_js_file()`, but their `language` label is `unknown` because `detect_language()` does not map them. If you plan to filter searches by `language: "javascript"`, JSX chunks will not match. Add `"jsx": "javascript", "tsx": "typescript"` to the dict if you want them included.

### Chunking strategy decision flow (actual behavior)

```
smart_chunk_file(file_path, content)
        │
        ▼
file_path.endswith((.js, .jsx, .ts, .tsx)) ?
        │
        ├─ yes ──► chunk_js_file()
        │              │
        │              ▼
        │         regex finds any matches?
        │              ├─ yes ──► structural blocks
        │              │           (oversized → chunk_file rebased)
        │              └─ no  ──► chunk_file() fallback
        │
        └─ no
            │
            ▼
        file_path.endswith(.py) ?
            │
            ├─ no  ──► chunk_file()    (naive line-window)
            │
            └─ yes
                  │
                  ▼
            ast.parse(content)
                  │
                  ├─ SyntaxError ──► chunk_file()
                  │
                  └─ success
                       │
                       ▼
                  any FunctionDef / AsyncFunctionDef / ClassDef in tree.body ?
                       │
                       ├─ no  ──► chunk_file()
                       │
                       └─ yes ──► structural AST chunking
                                     · gap chunks between spans
                                     · oversized blocks rebased via chunk_file
```

---

## 5. Embedding System

### Plain-English primer

**What an embedding is.** A function (a neural network) that takes text and returns a fixed-length list of floats (a "vector"). Two pieces of text that mean similar things get vectors that are geometrically close. So instead of matching keywords, you can compare *meaning*.

**Why a vector database.** SQL databases compare values exactly (`WHERE col = 'x'`). Vector databases compare by **distance in vector space** — they answer "give me the N stored vectors closest to this query vector." Doing that fast with thousands of vectors needs specialized indexes (HNSW, IVF, etc.). ChromaDB is a small embedded vector DB — no separate server, just a folder on disk (`./chroma_db`).

**Semantic search.** The query "where is auth handled?" is embedded into a vector and compared against every chunk's vector. Top-N closest vectors are returned. Because vectors capture meaning rather than letters, the query matches a function called `verify_credentials` even when the word "auth" never appears in it.

---

### `ingest_and_embed(files, project_id, replace_project=False)`

The write path. Coordinates dedup, deletion, chunking, embedding, and persistence.

**`replace_project` flag**

- `False` (default): incremental. For each file, prior chunks for that `file_path` are deleted (`collection.delete(where={"file_path": file.file_path})`) and replaced. Files not in this request are left untouched.
- `True`: nuclear. The entire collection `project_<project_id>` is dropped via `_reset_project_collection()` before any work begins. Any files not present in this request will be **lost from the index**. Use only for full re-indexes.

**Skip-on-unchanged via `compute_file_hash`**

```python
def compute_file_hash(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()
```

- A SHA-256 over the file content's UTF-8 bytes. Deterministic, 64-char hex string.
- **Where it's stored.** On every chunk emitted from a file: `metadata["file_hash"] = file_hash`. Every chunk of file X carries the same hash.
- **How re-ingest comparison works.** Before chunking a file, the pipeline asks Chroma for one existing chunk with that `file_path` (`collection.get(where={"file_path": file.file_path}, limit=1)`). If the returned chunk's stored `file_hash` equals the freshly computed hash, the file is **skipped entirely** (no delete, no chunking, no embedding) and `skipped_count` is incremented. Otherwise the normal delete-and-re-embed runs.
- **`skipped_files` in the return.** `ingest_and_embed()` returns `{"indexed": int, "skipped_files": int}`. As noted in §3, the API response currently exposes only `indexed`.

**Chunk ID format**

```
{project_id}_{chunk['file_path']}_{chunk['start_line']}
```

Example: `demo-repo-42_src/auth/login.py_9`.

This format makes IDs:
- **deterministic** — re-ingesting the same file with the same chunk boundaries produces the same ID (which is why `upsert` works cleanly), and
- **debuggable** — you can read an ID and instantly know its project, file, and starting line.

**Why upsert instead of insert.** `insert` would raise on duplicate IDs, which happen on every re-ingestion. `upsert` replaces if exists or inserts if new. Combined with the per-file `delete` for changed files, this keeps the index consistent and idempotent.

**ChromaDB metadata fields stored on every chunk**

| Field | Type | Example | Meaning |
|---|---|---|---|
| `file_path` | `str` | `"src/auth/login.py"` | Path within the project, used for filtering and deletion. |
| `start_line` | `int` | `9` | 1-indexed inclusive start line in the original file. |
| `end_line` | `int` | `17` | 1-indexed inclusive end line. |
| `project_id` | `str` | `"demo-repo-42"` | Project this chunk belongs to. Defensive — also implied by collection name. |
| `file_hash` | `str` | `"e3b0c44..."` | SHA-256 of the entire file the chunk came from. Drives the skip-on-unchanged optimization. |
| `language` | `str` | `"python"` | Output of `detect_language(file_path)`. Drives the `language` search filter. |

**Return value**

```python
{"indexed": <total_chunks>, "skipped_files": <skipped_count>}
```

---

### `retrieve_similar_chunks(query_text, top_k, project_id=None, language=None)`

The read path. Embeds the query, searches one collection (or all of them), applies metadata filters, and returns ranked matches.

**Step by step**

1. **Embed the query.** `model.encode(query_text, show_progress_bar=False).tolist()` produces a vector of the same dimensionality as stored chunks (e.g. 384 for the default model).
2. **Pick collections.** If `project_id` is given, only `project_<project_id>` is searched. If not, `client.list_collections()` is used and every project is searched.
3. **Build a metadata `where` filter.**

   | `project_id` | `language` | `where` |
   |---|---|---|
   | set | set | `{"$and": [{"project_id": <pid>}, {"language": <lang>}]}` |
   | set | `None` | `{"project_id": <pid>}` |
   | `None` | set | `{"language": <lang>}` |
   | `None` | `None` | (no `where` — unfiltered) |

   The `where` is only added to the query call when non-empty (Chroma rejects empty `where` on some versions).
4. **Query each collection.** `collection.query(query_embeddings=[v], n_results=top_k, include=[...], where=...)`. Empty collections are skipped (`collection.count() == 0`).
5. **Distance → similarity score.** Chroma returns `distances` (lower = closer). The pipeline normalizes to a 0–1-ish similarity with `score = 1.0 / (1.0 + distance)` so larger always means more relevant.
6. **Defensive post-filter.** If `project_id` is set, results are filtered again on `metadata.project_id` (redundant when Chroma already filtered, but harmless and safe across collection-naming changes).
7. **Rank and trim.** Sort by `score` descending, return the first `top_k`.

**Returned object shape**

```python
{
  "id": "demo-repo-42_src/auth/login.py_9",
  "score": 0.83,
  "text": "<raw chunk text>",
  "metadata": {
    "file_path": "src/auth/login.py",
    "start_line": 9, "end_line": 17,
    "project_id": "demo-repo-42",
    "file_hash": "e3b0c44...",
    "language": "python"
  }
}
```

---

### Configurable embedding model

The model name is read from the environment, falling back to a fast default:

```python
model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
_model = SentenceTransformer(model_name)
```

| Model | Size | Speed | Dimensions | Best for |
|---|---|---|---|---|
| `all-MiniLM-L6-v2` | 22 MB | fastest | 384 | demos, dev, small repos |
| `all-MiniLM-L12-v2` | 33 MB | fast | 384 | balanced quality/cost |
| `all-mpnet-base-v2` | 420 MB | slow | 768 | production, accuracy-critical |

> Switching models after data already exists will produce a **dimension/space mismatch**: query vectors from a 768-dim model can't be compared to 384-dim stored vectors. After changing the model, do a full re-ingest with `replace_project=true` for every project.

---

## 6. Complete Ingestion Flow

```
1.  Node.js backend collects files from a repo upload
       │
       ▼
2.  POST /ingest  (body: {project_id, files[], replace_project})
       │
       ▼
3.  routers/ingest.py            -> ingest(data: IngestInput)
       │
       ▼
4.  controllers/ingest_controller.py -> handle_ingest(request)
       │
       ▼
5.  services/ingest_service.py   -> IngestService.ingest(request)
       │
       ▼
6.  services/embedder.py         -> ingest_and_embed(files, project_id, replace_project)
       │
       ├── if replace_project: _reset_project_collection(project_id)
       │
       ├── collection = get_or_create_collection(project_id)
       │
       └── for each file in files:
              a) file_hash = compute_file_hash(file.content)
              b) Look up one existing chunk for file.file_path; if its
                 stored file_hash == file_hash → skipped_count++; continue
              c) If not replace_project: delete any prior chunks for this file
              d) chunks = smart_chunk_file(file.file_path, file.content)
                    • dispatches to chunk_js_file / AST / chunk_file
              e) for each chunk:
                    embedding = SentenceTransformer.encode(chunk.text)
                    chunk_id = f"{project_id}_{chunk.file_path}_{chunk.start_line}"
                    collection.upsert(ids, embeddings, documents, metadatas)
                    total_chunks++
       │
       ▼
7.  Return {"indexed": total_chunks, "skipped_files": skipped_count}
       │
       ▼
8.  IngestService maps to IngestResponse(indexed=...)  -> JSON  -> Node.js
```

---

## 7. Complete Search Flow

```
1.  Node.js backend forwards the user's natural-language question
       │   POST /query  body: {query, top_k, project_id, language?}
       ▼
2.  routers/query.py             -> agentic_query(request)
       │
       ▼
3.  controllers/query_controller.py -> handle_agentic_query(request)
       │
       ▼
4.  services/query_service.py    -> QueryService.query(request)
       │   passes (query, top_k, project_id, language)
       ▼
5.  services/rag_service.py      -> RagService.agentic_query(...)
       │   first LLM call decides whether to use the retrieve_code_chunks tool
       │
       ├── direct answer → return AgenticQueryResult(tool_used=False)
       │
       └── tool call:
            services/embedding_service.py -> retrieve_chunks(...)
                  │
                  ▼
            services/embedder.py -> retrieve_similar_chunks(query_text, top_k, project_id, language)
                  a) embed query with SentenceTransformer
                  b) pick collections (one project, or all)
                  c) build where filter from project_id/language combos
                  d) collection.query(...) on each
                  e) normalize distance → similarity score
                  f) defensive post-filter on project_id if set
                  g) sort by score desc, return top_k
       │
       ▼
6.  Second LLM call composes the final answer using retrieved chunks
       │
       ▼
7.  Return QueryResponse(query, answer, tool_used, sources[])
```

---

## 8. ChromaDB Storage

ChromaDB is a local persistent store at `./chroma_db` (working directory of the Python process). One **collection per project**, named `project_<project_id>`. One **record per chunk**.

A single stored entry looks like this conceptually (Chroma stores vectors in its own index format; this is the logical view):

```
id        : "demo-repo-42_src/auth/login.py_9"
embedding : [0.018, -0.073, 0.144, ...]     # 384 floats (default model)
document  : "class LoginService:\n    def __init__(self, store):\n        self.store = store\n    def login(self, user, pw):\n        ..."
metadata  : {
    "file_path"  : "src/auth/login.py",
    "start_line" : 9,
    "end_line"   : 17,
    "project_id" : "demo-repo-42",
    "file_hash"  : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "language"   : "python"
}
```

| Column | Example | Notes |
|---|---|---|
| `id` | `demo-repo-42_src/auth/login.py_9` | `{project_id}_{file_path}_{start_line}`. Deterministic, debuggable. |
| `embedding` | `[0.018, -0.073, 0.144, ...]` (384 floats) | Output of the SentenceTransformer model. Dimension depends on the model. |
| `document` | raw chunk text | Returned verbatim on retrieval; this is what the LLM eventually sees. |
| `metadata.file_path` | `src/auth/login.py` | Used for incremental delete and the `file_path` `where` lookup. |
| `metadata.start_line` / `metadata.end_line` | `9`, `17` | Used by the UI to deep-link to source. |
| `metadata.project_id` | `demo-repo-42` | Defensive duplicate of the collection name. |
| `metadata.file_hash` | SHA-256 hex | Drives skip-on-unchanged on re-ingest. |
| `metadata.language` | `python` | Drives the API's `language` filter. |

---

## 9. Configuration

Environment variables read or set by this pipeline:

| Variable | Default | Required | Description |
|---|---|---|---|
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | No | Name of the SentenceTransformer model to load. Changing this after data is indexed requires a full re-ingest because vector dimensions/spaces will mismatch. |
| `HF_HUB_DISABLE_PROGRESS_BARS` | `1` | No | Set via `os.environ.setdefault` at import time. Suppresses HuggingFace download progress bars (which break under uvicorn reload on Windows). |
| `TRANSFORMERS_NO_ADVISORY_WARNINGS` | `1` | No | Set via `os.environ.setdefault` at import time. Silences advisory warnings from the `transformers` library. |

Hardcoded (not environment-driven) — change in source if you need to:

| Setting | Where | Value |
|---|---|---|
| ChromaDB persistence path | `_get_chroma_client()` in `embedder.py` | `./chroma_db` |
| Naive chunker `chunk_size` | `chunk_file()` default | `100` lines |
| Naive chunker `overlap` | `chunk_file()` default | `20` lines |
| Smart chunker `max_chunk_size` | `smart_chunk_file()` / `chunk_js_file()` default | `150` lines |

---

## 10. Known Limitations

- **`.jsx` and `.tsx` get an `unknown` `language` label.** They are structurally chunked (good), but `detect_language()` does not map their extensions, so `language: "javascript"` filters won't return them. Trivial fix in `detect_language()`.
- **`.mjs`, `.cjs`, `.mts`, `.cts` are not structurally chunked.** They fall through to the naive line-window chunker. Acceptable for typical projects; add to `smart_chunk_file()` if needed.
- **`skipped_files` is computed but not exposed via the API.** Only `indexed` is surfaced. Add `skipped_files` to `IngestResponse` and forward it in `IngestService.ingest()` to expose it.
- **JS chunker is regex-based, not a real parser.** Misses object-method shorthand, generators, decorators, `var` declarations, anonymous-function-assigned-to-`const`, and some other constructs. Pragmatic 80/20.
- **Old chunks lack `language` metadata.** Anything indexed before the `language` field was added will be excluded by any `language` filter. A re-ingest backfills.
- **Re-embedding granularity is whole-file.** If a single character changes in a 5000-line file, *all* chunks for that file are re-embedded. Per-chunk hashing would fix it but adds complexity.
- **Skip-on-hash assumes prior ingestion was complete.** If a previous run was interrupted mid-file, the surviving chunks still carry the original `file_hash`. A second ingestion of unchanged content will see a hash match and skip — even though the index is incomplete. Mitigation: use `replace_project=true` for recovery.
- **No language inference from the natural-language query.** The `language` filter is an explicit field. The pipeline does *not* parse the query for phrases like "in Python" and auto-set the filter.
- **ChromaDB collection names use the raw `project_id`.** Special characters in `project_id` may collide with ChromaDB naming rules. Restrict `project_id` to safe characters at the API layer.
- **Large files are loaded entirely into memory.** Both the file content and all its chunk vectors are held in RAM during ingestion. This service is not designed for files in the hundreds of MB.
