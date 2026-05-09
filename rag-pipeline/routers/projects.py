from fastapi import APIRouter, status

from models.schemas import ErrorResponse
from services.embedder import project_stats, delete_project_vectors

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
    Returns chunk/file counts from Chroma (source of truth).
    """
    return {"project_id": project_id, **project_stats(project_id)}


@router.delete(
    "/{project_id}/vectors",
    status_code=status.HTTP_200_OK,
    responses={
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
def delete_vectors(project_id: str):
    """Delete all vectors for this project (drops the Chroma collection)."""
    delete_project_vectors(project_id)
    return {"project_id": project_id, "deleted": True}

