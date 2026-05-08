"""Query routes."""
from fastapi import APIRouter, status

from controllers.query_controller import handle_agentic_query, handle_snippet_analysis
from models.schemas import (
    ErrorResponse,
    QueryRequest,
    QueryResponse,
    SnippetAnalysisRequest,
    SnippetAnalysisResponse,
)

router = APIRouter(prefix="", tags=["RAG"])


@router.post(
    "/query",
    response_model=QueryResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def agentic_query(request: QueryRequest) -> QueryResponse:
    """Agentic query endpoint."""
    return await handle_agentic_query(request)


@router.post(
    "/analyze-snippet",
    response_model=SnippetAnalysisResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def analyze_snippet(request: SnippetAnalysisRequest) -> SnippetAnalysisResponse:
    """Analyze a single code snippet with structured output."""
    return await handle_snippet_analysis(request)
