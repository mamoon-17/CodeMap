from fastapi import APIRouter
from models.schemas import IngestInput
from services.embedder import ingest_and_embed

router = APIRouter()

@router.post("/ingest")
def ingest(data: IngestInput):
    result = ingest_and_embed(data.files, data.project_id)
    return result