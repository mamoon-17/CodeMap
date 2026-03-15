"""Service for repository ingestion operations."""
from models.schemas import IngestInput, IngestResponse
from services.embedder import ingest_and_embed


class IngestService:
    """Coordinates repository ingestion and vector indexing."""

    def ingest(self, request: IngestInput) -> IngestResponse:
        result = ingest_and_embed(request.files, request.project_id)
        return IngestResponse(indexed=result["indexed"])


ingest_service: IngestService | None = None


def get_ingest_service() -> IngestService:
    """Get or create singleton ingest service."""
    global ingest_service
    if ingest_service is None:
        ingest_service = IngestService()
    return ingest_service
