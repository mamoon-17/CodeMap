import logging
import traceback

from fastapi import APIRouter, HTTPException, status
from controllers.ingest_controller import handle_ingest, handle_storage_ingest
from models.schemas import ErrorResponse, IngestInput, IngestResponse, StorageIngestInput

router = APIRouter(prefix="", tags=["Ingest"])
logger = logging.getLogger(__name__)

@router.post("/ingest")
def ingest(data: IngestInput) -> IngestResponse:
    """Ingest repository files and index vectors (raw file payloads)."""
    try:
        return handle_ingest(data)
    except Exception as e:
        # Ensure bad input or unexpected errors don't crash the service.
        # Log full traceback for debugging, return a user-friendly error.
        logger.error("Ingest failed for project_id=%s: %s", data.project_id, str(e))
        logger.debug(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingest failed: {str(e)}",
        )


@router.post("/ingest/storage")
async def ingest_from_storage(data: StorageIngestInput) -> IngestResponse:
    """Ingest from a ZIP already uploaded to Supabase Storage.

    FastAPI downloads the ZIP using its own service-role credentials,
    filters, indexes, and deletes the object on success.
    """
    try:
        return await handle_storage_ingest(data)
    except ValueError as e:
        logger.warning("Storage ingest validation error for project_id=%s: %s", data.project_id, str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Storage ingest failed for project_id=%s: %s", data.project_id, str(e))
        logger.debug(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingest failed: {str(e)}",
        )