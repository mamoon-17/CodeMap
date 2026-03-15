"""Controller for ingestion endpoints."""
from models.schemas import IngestInput, IngestResponse
from services.ingest_service import get_ingest_service


def handle_ingest(request: IngestInput) -> IngestResponse:
    """Handle ingest requests via ingest service."""
    ingest_service = get_ingest_service()
    return ingest_service.ingest(request)
