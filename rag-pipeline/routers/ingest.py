from fastapi import APIRouter, HTTPException, status
from controllers.ingest_controller import handle_ingest
from models.schemas import ErrorResponse, IngestInput, IngestResponse

router = APIRouter(prefix="", tags=["Ingest"])

@router.post("/ingest")
def ingest(data: IngestInput) -> IngestResponse:
    """Ingest repository files and index vectors."""
    try:
        return handle_ingest(data)
    except Exception as e:
        # Ensure bad input or unexpected errors don't crash the service
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )