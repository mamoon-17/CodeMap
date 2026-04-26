from __future__ import annotations

from typing import Any, Iterable

import chromadb
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from sentence_transformers import SentenceTransformer

from services.chunker import chunk_file
from services.chunk_store import init_db, delete_project, delete_file, upsert_chunks

_model: SentenceTransformer | None = None
_chroma_client: chromadb.PersistentClient | None = None
logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = 32
CHUNK_WORKERS = max(2, min(4, (os.cpu_count() or 2)))


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


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


def ingest_and_embed(
    files: Iterable[Any],
    project_id: str,
    replace_project: bool = False,
) -> dict[str, int]:
    """Chunk files, embed, and persist vectors in ChromaDB."""
    t0 = time.perf_counter()
    init_db()
    if replace_project:
        _reset_project_collection(project_id)
        delete_project(project_id)

    collection = get_or_create_collection(project_id)
    t_model0 = time.perf_counter()
    model = _get_model()
    t_model = time.perf_counter() - t_model0
    total_chunks = 0
    file_count = 0
    t_chunk = 0.0
    t_chunk_store = 0.0
    t_embed = 0.0
    t_upsert = 0.0

    # Materialize iterable once (FastAPI gives a list, but this keeps types simple)
    files_list = list(files)
    file_count = len(files_list)

    # Chunk files in parallel (I/O + string splitting). Keep embedding/upsert single-stream.
    t1 = time.perf_counter()
    chunk_results: list[tuple[str, list[dict[str, Any]]]] = []
    with ThreadPoolExecutor(max_workers=CHUNK_WORKERS) as ex:
        futures = {
            ex.submit(chunk_file, f.file_path, f.content): f.file_path for f in files_list
        }
        for fut in as_completed(futures):
            file_path = futures[fut]
            chunks = fut.result()
            chunk_results.append((file_path, chunks))
    t_chunk += time.perf_counter() - t1

    # Keep original file order for deterministic indexing (optional)
    by_path = {p: c for (p, c) in chunk_results}
    ordered_paths = [f.file_path for f in files_list]

    for file_path in ordered_paths:
        chunks = by_path.get(file_path, [])
        if not replace_project:
            collection.delete(where={"file_path": file_path})
            delete_file(project_id, file_path)

        if not chunks:
            continue

        # Store chunk metadata in relational DB (cleanup+validation)
        # Vector ids are deterministic and match Chroma ids below.
        for c in chunks:
            c["vector_id"] = f"{project_id}_{c['file_path']}_{c['start_line']}"
        tcs0 = time.perf_counter()
        upsert_chunks(project_id, file_path, chunks)
        t_chunk_store += time.perf_counter() - tcs0

        texts = [c["text"] for c in chunks]
        ids = [c["vector_id"] for c in chunks]
        metadatas = [
            {
                "file_path": c["file_path"],
                "start_line": c["start_line"],
                "end_line": c["end_line"],
                "project_id": project_id,
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
        "ingest_and_embed project=%s files=%d chunks=%d replace=%s elapsed=%.2fs (model=%.2fs chunk=%.2fs chunkdb=%.2fs embed=%.2fs upsert=%.2fs workers=%d)",
        project_id,
        file_count,
        total_chunks,
        replace_project,
        elapsed,
        t_model,
        t_chunk,
        t_chunk_store,
        t_embed,
        t_upsert,
        CHUNK_WORKERS,
    )
    return {"indexed": total_chunks}


def retrieve_similar_chunks(
    query_text: str,
    top_k: int,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    """Retrieve top-k chunks from one project or across all project collections."""
    client = _get_chroma_client()
    model = _get_model()
    query_embedding = model.encode(query_text).tolist()

    collections: list[Any] = []
    if project_id:
        collections.append(get_or_create_collection(project_id))
    else:
        collections = client.list_collections()

    matches: list[dict[str, Any]] = []
    for collection in collections:
        if hasattr(collection, "count") and collection.count() == 0:
            continue

        result = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

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