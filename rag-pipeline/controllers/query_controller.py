"""Controller for query endpoints."""
import logging

from fastapi import HTTPException, status

from config import config
from constants import ERROR_MESSAGES
from models.schemas import QueryRequest, QueryResponse
from services.query_service import get_query_service

logger = logging.getLogger(__name__)


async def handle_agentic_query(request: QueryRequest) -> QueryResponse:
    """Handle agentic query request and map errors to HTTP responses."""
    if not config.is_valid():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ERROR_MESSAGES["MISSING_API_KEY"],
        )

    try:
        query_service = get_query_service()
        return await query_service.query(request)
    except ValueError as exc:
        logger.error(f"Validation error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        error_msg = str(exc)
        logger.error(f"Query processing error: {error_msg}")
        if "RATE_LIMIT" in error_msg or "429" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again later.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process query: {error_msg}",
        ) from exc
