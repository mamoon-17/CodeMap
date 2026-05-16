"""Controller for ingestion endpoints."""
import logging

from fastapi import HTTPException, status

from models.schemas import IngestInput, IngestResponse, StorageIngestInput
from services.ingest_service import get_ingest_service

logger = logging.getLogger(__name__)


def handle_ingest(request: IngestInput) -> IngestResponse:
    """Handle ingest requests via ingest service (raw file payloads)."""
    try:
        ingest_service = get_ingest_service()
        return ingest_service.ingest(request)
    except Exception as exc:
        logger.exception("Ingest failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingest failed: {type(exc).__name__}: {exc}",
        ) from exc


async def handle_storage_ingest(request: StorageIngestInput) -> IngestResponse:
    """Handle storage-based ingest requests.

    Downloads ZIP from Supabase Storage, filters, indexes, and deletes on success.
    """
    ingest_service = get_ingest_service()
    return await ingest_service.ingest_from_storage(request)
