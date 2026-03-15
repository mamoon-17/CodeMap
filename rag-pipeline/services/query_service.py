"""Service for query operations."""
from models.schemas import QueryRequest, QueryResponse, SourceChunk
from services.rag_service import get_rag_service


class QueryService:
    """Coordinates query requests through the RAG pipeline."""

    async def query(self, request: QueryRequest) -> QueryResponse:
        rag_service = get_rag_service()
        result = await rag_service.agentic_query(
            request.query,
            request.top_k,
            request.project_id,
        )
        return QueryResponse(
            query=result.query,
            answer=result.answer,
            tool_used=result.tool_used,
            sources=[SourceChunk(**source) for source in result.sources] if result.sources else None,
        )


query_service: QueryService | None = None


def get_query_service() -> QueryService:
    """Get or create singleton query service."""
    global query_service
    if query_service is None:
        query_service = QueryService()
    return query_service
