from __future__ import annotations

import hashlib
import os
import sys

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")


class _SafeStderr:
    """Wrapper around sys.stderr that swallows OSError on write/flush.

    Works around a Windows-specific issue where tqdm (used by transformers while
    loading model weights) calls sys.stderr.flush() and raises
    OSError [Errno 22] when run under uvicorn's reload subprocess.
    """

    def __init__(self, wrapped):
        self._wrapped = wrapped

    def write(self, data):
        try:
            return self._wrapped.write(data)
        except OSError:
            return len(data) if isinstance(data, (str, bytes)) else 0

    def flush(self):
        try:
            return self._wrapped.flush()
        except OSError:
            return None

    def __getattr__(self, name):
        return getattr(self._wrapped, name)


if not isinstance(sys.stderr, _SafeStderr):
    sys.stderr = _SafeStderr(sys.stderr)

from typing import Any, Iterable

import chromadb
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from sentence_transformers import SentenceTransformer

try:
    from transformers.utils import logging as _hf_logging

    _hf_logging.disable_progress_bar()
except Exception:
    pass

from services.chunker import smart_chunk_file


def compute_file_hash(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()

_model: SentenceTransformer | None = None
_chroma_client: chromadb.PersistentClient | None = None
logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = 32
CHUNK_WORKERS = max(2, min(4, (os.cpu_count() or 2)))


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        # Available models — set EMBEDDING_MODEL in .env to switch:
        # all-MiniLM-L6-v2  — 22MB, fastest, 384 dims (default)
        # all-MiniLM-L12-v2 — 33MB, slightly slower, better accuracy
        # all-mpnet-base-v2  — 420MB, slowest, 768 dims, best accuracy
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        _model = SentenceTransformer(model_name)
    return _model


def warmup_model() -> None:
    """Preload the model at startup to avoid Windows/uvicorn tqdm issues on first request."""
    _get_model()


def _get_chroma_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path="./chroma_db")
    return _chroma_client


def get_or_create_collection(project_id: str):
    return _get_chroma_client().get_or_create_collection(name=f"project_{project_id}")


def _reset_project_collection(project_id: str):
    client = _get_chroma_client()
    collection_name = f"project_{project_id}"
    try:
        client.delete_collection(name=collection_name)
    except Exception:
        pass


def delete_project_vectors(project_id: str) -> None:
    """Delete all vectors for a project by dropping its Chroma collection."""
    _reset_project_collection(project_id)


def project_stats(project_id: str, page_size: int = 2000) -> dict[str, int]:
    """Compute file/chunk counts from Chroma (source of truth)."""
    collection = get_or_create_collection(project_id)
    chunks = int(collection.count()) if hasattr(collection, "count") else 0
    if chunks == 0:
        return {"files": 0, "chunks": 0}

    file_paths: set[str] = set()
    offset = 0
    while True:
        result = collection.get(
            include=["metadatas"],
            limit=page_size,
            offset=offset,
        )
        metas = result.get("metadatas") or []
        if not metas:
            break
        for m in metas:
            if isinstance(m, dict):
                fp = m.get("file_path")
                if isinstance(fp, str) and fp:
                    file_paths.add(fp)
        if len(metas) < page_size:
            break
        offset += page_size

    return {"files": len(file_paths), "chunks": chunks}


def ingest_and_embed(
    files: Iterable[Any],
    project_id: str,
    replace_project: bool = False,
) -> dict[str, int]:
    """Chunk files, embed, and persist vectors in ChromaDB."""
    t0 = time.perf_counter()
    if replace_project:
        _reset_project_collection(project_id)

    collection = get_or_create_collection(project_id)
    t_model0 = time.perf_counter()
    model = _get_model()
    t_model = time.perf_counter() - t_model0
    total_chunks = 0
    skipped_count = 0

    files_list = list(files)
    file_count = len(files_list)

    files_to_process: list[Any] = []
    if not replace_project:
        for file in files_list:
            file_hash = compute_file_hash(file.content)
            existing = collection.get(where={"file_path": file.file_path}, limit=1)
            existing_metas = existing.get("metadatas") or []
            if existing_metas:
                existing_hash = (existing_metas[0] or {}).get("file_hash")
                if existing_hash == file_hash:
                    skipped_count += 1
                    continue
            files_to_process.append(file)
    else:
        files_to_process = files_list

    t_chunk = 0.0
    t_chunk_store = 0.0
    t_embed = 0.0
    t_upsert = 0.0

    if not files_to_process:
        elapsed = time.perf_counter() - t0
        logger.info(
            "ingest_and_embed project=%s files=%d chunks=0 (all skipped) replace=%s elapsed=%.2fs",
            project_id,
            file_count,
            replace_project,
            elapsed,
        )
        return {"indexed": 0, "skipped_files": skipped_count}

    # Chunk files in parallel (I/O + string splitting). Keep embedding/upsert single-stream.
    t1 = time.perf_counter()
    chunk_results: list[tuple[str, list[dict[str, Any]]]] = []
    with ThreadPoolExecutor(max_workers=CHUNK_WORKERS) as ex:
        futures = {
            ex.submit(smart_chunk_file, f.file_path, f.content): f.file_path
            for f in files_to_process
        }
        for fut in as_completed(futures):
            file_path = futures[fut]
            chunks = fut.result()
            chunk_results.append((file_path, chunks))
    t_chunk += time.perf_counter() - t1

    by_path = {p: c for (p, c) in chunk_results}
    path_to_file = {f.file_path: f for f in files_to_process}
    ordered_paths = [f.file_path for f in files_to_process]

    for file_path in ordered_paths:
        chunks = by_path.get(file_path, [])
        if not replace_project:
            collection.delete(where={"file_path": file_path})

        if not chunks:
            continue

        # Vector ids are deterministic and match Chroma ids below.
        for c in chunks:
            c["vector_id"] = f"{project_id}_{c['file_path']}_{c['start_line']}"

        texts = [c["text"] for c in chunks]
        ids = [c["vector_id"] for c in chunks]
        file_obj = path_to_file[file_path]
        file_hash = compute_file_hash(file_obj.content)
        metadatas = [
            {
                "file_path": c["file_path"],
                "start_line": c["start_line"],
                "end_line": c["end_line"],
                "project_id": project_id,
                "file_hash": file_hash,
                "language": c.get("language", "unknown"),
            }
            for c in chunks
        ]

        t2 = time.perf_counter()
        embeddings = model.encode(
            texts,
            batch_size=EMBED_BATCH_SIZE,
            show_progress_bar=False,
        ).tolist()
        t_embed += time.perf_counter() - t2

        t3 = time.perf_counter()
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )
        t_upsert += time.perf_counter() - t3

        total_chunks += len(chunks)

    elapsed = time.perf_counter() - t0
    logger.info(
        "ingest_and_embed project=%s files=%d chunks=%d replace=%s elapsed=%.2fs "
        "(model=%.2fs chunk=%.2fs chunkdb=%.2fs embed=%.2fs upsert=%.2fs workers=%d skipped=%d)",
        project_id,
        file_count,
        total_chunks,
        replace_project,
        elapsed,
        t_model,
        t_chunk,
        0.0,
        t_embed,
        t_upsert,
        CHUNK_WORKERS,
        skipped_count,
    )
    return {"indexed": total_chunks, "skipped_files": skipped_count}


def retrieve_similar_chunks(
    query_text: str,
    top_k: int,
    project_id: str | None = None,
    language: str | None = None,
) -> list[dict[str, Any]]:
    """Retrieve top-k chunks from one project or across all project collections."""
    client = _get_chroma_client()
    model = _get_model()
    query_embedding = model.encode(query_text, show_progress_bar=False).tolist()

    collections: list[Any] = []
    if project_id:
        collections.append(get_or_create_collection(project_id))
    else:
        collections = client.list_collections()

    where: dict = {}
    if project_id and language:
        where = {"$and": [{"project_id": project_id},
                          {"language": language}]}
    elif project_id:
        where = {"project_id": project_id}
    elif language:
        where = {"language": language}

    matches: list[dict[str, Any]] = []
    for collection in collections:
        if hasattr(collection, "count") and collection.count() == 0:
            continue

        query_kwargs: dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results": top_k,
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            query_kwargs["where"] = where

        result = collection.query(**query_kwargs)

        ids = result.get("ids", [[]])[0]
        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]
        dists = result.get("distances", [[]])[0]

        for idx, chunk_id in enumerate(ids):
            metadata = metas[idx] if idx < len(metas) else {}
            distance = dists[idx] if idx < len(dists) else 1.0
            document = docs[idx] if idx < len(docs) else ""
            matches.append(
                {
                    "id": chunk_id,
                    "score": 1.0 / (1.0 + float(distance)),
                    "metadata": metadata,
                    "text": document,
                }
            )

    if project_id:
        matches = [
            match
            for match in matches
            if (match.get("metadata") or {}).get("project_id") == project_id
        ]

    matches.sort(key=lambda item: item["score"], reverse=True)
    return matches[:top_k]