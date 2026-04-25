from __future__ import annotations

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
from sentence_transformers import SentenceTransformer

try:
    from transformers.utils import logging as _hf_logging

    _hf_logging.disable_progress_bar()
except Exception:
    pass

from services.chunker import smart_chunk_file

_model: SentenceTransformer | None = None
_chroma_client: chromadb.PersistentClient | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
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


def ingest_and_embed(
    files: Iterable[Any],
    project_id: str,
    replace_project: bool = False,
) -> dict[str, int]:
    """Chunk files, embed, and persist vectors in ChromaDB."""
    if replace_project:
        _reset_project_collection(project_id)

    collection = get_or_create_collection(project_id)
    model = _get_model()
    total_chunks = 0

    for file in files:
        if not replace_project:
            collection.delete(where={"file_path": file.file_path})

        chunks = smart_chunk_file(file.file_path, file.content)

        for chunk in chunks:
            embedding = model.encode(chunk["text"], show_progress_bar=False).tolist()
            chunk_id = f"{project_id}_{chunk['file_path']}_{chunk['start_line']}"

            # Upsert prevents duplicate-id failures on re-ingestion.
            collection.upsert(
                ids=[chunk_id],
                embeddings=[embedding],
                documents=[chunk["text"]],
                metadatas=[
                    {
                        "file_path": chunk["file_path"],
                        "start_line": chunk["start_line"],
                        "end_line": chunk["end_line"],
                        "project_id": project_id,
                    }
                ],
            )
            total_chunks += 1

    return {"indexed": total_chunks}


def retrieve_similar_chunks(
    query_text: str,
    top_k: int,
    project_id: str | None = None,
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