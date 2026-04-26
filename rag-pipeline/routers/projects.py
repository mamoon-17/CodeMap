from fastapi import APIRouter, status

from models.schemas import ErrorResponse
from services.chunk_store import stats as chunk_stats

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get(
    "/{project_id}/stats",
    status_code=status.HTTP_200_OK,
    responses={
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
def get_project_stats(project_id: str):
    """
    Lightweight validation endpoint to confirm that re-indexing replaced old data.
    Returns chunk/file counts from the relational chunk store.
    """
    return {"project_id": project_id, **chunk_stats(project_id)}

