"""Service for repository ingestion operations."""
from __future__ import annotations

import asyncio
import logging
import threading

from models.schemas import (
    FileInput,
    IngestInput,
    IngestResponse,
    StorageIngestInput,
)
from services.embedder import ingest_and_embed
from services.supabase_storage import delete_object, download_object
from services.zip_filter import FilteredFile, filter_zip


_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()

logger = logging.getLogger(__name__)


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
        """Ingest files provided as raw payloads (legacy / GitHub reindex)."""
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
            return IngestResponse(
                indexed=result["indexed"],
                file_count=len(request.files),
            )

    async def ingest_from_storage(
        self, request: StorageIngestInput
    ) -> IngestResponse:
        """Download ZIP from Supabase Storage, filter, ingest, and clean up.

        The object in Supabase is deleted only after a fully successful
        ingest.  On any failure the object is kept so Node can retry.
        """
        logger.info(
            "[ingest_from_storage] Downloading %s/%s for project %s",
            request.storage_bucket,
            request.storage_path,
            request.project_id,
        )

        # 1. Download
        zip_bytes = await download_object(
            request.storage_bucket, request.storage_path
        )
        logger.info(
            "[ingest_from_storage] Downloaded %d bytes", len(zip_bytes)
        )

        # 2. Filter (CPU-bound, run in thread so we don't block the event loop)
        filter_result = await asyncio.to_thread(filter_zip, zip_bytes)
        if filter_result.error:
            raise ValueError(filter_result.error)
        if not filter_result.files:
            raise ValueError(
                "No supported source files found in ZIP "
                "(allowed: .js, .ts, .py, .java, .cpp, .c, .cs, .go, "
                ".rb, .php, .swift, .kt, .rs, .html, .css, .json, .xml, "
                ".yaml, .yml)"
            )

        # 3. Convert FilteredFile → FileInput for the embedder
        file_inputs = [
            FileInput(file_path=f.file_path, content=f.content)
            for f in filter_result.files
        ]

        # 4. Ingest (CPU-bound embedding, run under per-project lock)
        lock = _get_lock(request.project_id)

        def _do_ingest():
            with lock:
                return ingest_and_embed(
                    file_inputs,
                    request.project_id,
                    replace_project=request.replace_project,
                )

        result = await asyncio.to_thread(_do_ingest)

        file_count = len(filter_result.files)
        logger.info(
            "[ingest_from_storage] Indexed %d chunks from %d files for project %s",
            result["indexed"],
            file_count,
            request.project_id,
        )

        # 5. Delete storage object only on success
        try:
            await delete_object(request.storage_bucket, request.storage_path)
            logger.info(
                "[ingest_from_storage] Deleted storage object %s/%s",
                request.storage_bucket,
                request.storage_path,
            )
        except Exception as exc:
            # Non-fatal — the object will be cleaned up on retry or manual action.
            logger.warning(
                "[ingest_from_storage] Failed to delete storage object %s/%s: %s",
                request.storage_bucket,
                request.storage_path,
                exc,
            )

        return IngestResponse(indexed=result["indexed"], file_count=file_count)


ingest_service: IngestService | None = None


def get_ingest_service() -> IngestService:
    """Get or create singleton ingest service."""
    global ingest_service
    if ingest_service is None:
        ingest_service = IngestService()
    return ingest_service
