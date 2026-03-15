from fastapi import APIRouter
from controllers.ingest_controller import handle_ingest
from models.schemas import IngestInput, IngestResponse

router = APIRouter(prefix="", tags=["Ingest"])

@router.post("/ingest")
def ingest(data: IngestInput) -> IngestResponse:
    """Ingest repository files and index vectors."""
    return handle_ingest(data)