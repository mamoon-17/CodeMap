from fastapi import APIRouter
from models.schemas import ChunkInput
from services.embedder import embed_and_store

router = APIRouter()

@router.post("/embed")
def embed(data: ChunkInput):
    result = embed_and_store(data.chunk_ids, data.project_id)
    return result