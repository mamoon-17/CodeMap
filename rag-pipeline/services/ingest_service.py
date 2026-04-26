"""Service for repository ingestion operations."""
from __future__ import annotations

import threading

from models.schemas import IngestInput, IngestResponse
from services.embedder import ingest_and_embed


_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _get_lock(project_id: str) -> threading.Lock:
    with _locks_guard:
        lock = _locks.get(project_id)
        if lock is None:
            lock = threading.Lock()
            _locks[project_id] = lock
        return lock


class IngestService:
    """Coordinates repository ingestion and vector indexing."""

    def ingest(self, request: IngestInput) -> IngestResponse:
        # Prevent concurrent ingests for the same project id.
        # This avoids race conditions in Chroma when one ingest deletes/recreates a collection
        # while another is trying to read/write to it.
        lock = _get_lock(request.project_id)
        with lock:
            result = ingest_and_embed(
                request.files,
                request.project_id,
                replace_project=request.replace_project,
            )
            return IngestResponse(indexed=result["indexed"])


ingest_service: IngestService | None = None


def get_ingest_service() -> IngestService:
    """Get or create singleton ingest service."""
    global ingest_service
    if ingest_service is None:
        ingest_service = IngestService()
    return ingest_service
