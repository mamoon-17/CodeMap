from fastapi import APIRouter, HTTPException, Query, status

from models.schemas import ErrorResponse
from services.embedder import (
    project_stats,
    delete_project_vectors,
    project_file_paths,
    project_file_content,
)

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


@router.get(
    "/{project_id}/files",
    status_code=status.HTTP_200_OK,
    responses={
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
def get_project_files(project_id: str):
    """Return indexed file paths for repository navigation."""
    return {"project_id": project_id, "files": project_file_paths(project_id)}


@router.get(
    "/{project_id}/files/content",
    status_code=status.HTTP_200_OK,
    responses={
        404: {"model": ErrorResponse, "description": "File not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
def get_project_file_content(project_id: str, path: str = Query(..., min_length=1)):
    """Return indexed content for a selected repository file."""
    result = project_file_content(project_id, path)
    if result is None:
        raise HTTPException(status_code=404, detail="Indexed file not found")
    return result


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

