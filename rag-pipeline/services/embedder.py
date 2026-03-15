from __future__ import annotations

from typing import Any, Iterable

import chromadb
from sentence_transformers import SentenceTransformer

from services.chunker import chunk_file

_model: SentenceTransformer | None = None
_chroma_client: chromadb.PersistentClient | None = None


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


def ingest_and_embed(files: Iterable[Any], project_id: str) -> dict[str, int]:
    """Chunk files, embed, and persist vectors in ChromaDB."""
    collection = get_or_create_collection(project_id)
    model = _get_model()
    total_chunks = 0

    for file in files:
        chunks = chunk_file(file.file_path, file.content)

        for chunk in chunks:
            embedding = model.encode(chunk["text"]).tolist()
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

    matches.sort(key=lambda item: item["score"], reverse=True)
    return matches[:top_k]