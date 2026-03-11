"""
CodeMap - RAG Service (FastAPI)
Agentic RAG pipeline with LLM function calling and vector search

This service combines:
- OpenAI LLM with function calling
- Vector search for code chunks (currently mock, ready for real vector DB)
- Async operations with type safety
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from config import config
from models.schemas import QueryRequest, QueryResponse, HealthResponse, ErrorResponse, SourceChunk
from services.rag_service import get_rag_service
from constants import ERROR_MESSAGES

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Application Lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("🚀 Starting RAG service...")
    
    # Validate configuration
    missing = config.validate()
    if missing:
        logger.error(f"❌ Missing required environment variables: {', '.join(missing)}")
        logger.error("Please check your .env file")
    else:
        logger.info("✅ Configuration validated")
    
    # Initialize services
    try:
        get_rag_service()
        logger.info("✅ RAG service initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize RAG service: {e}")
    
    logger.info(f"🎯 RAG service ready on port {config.PORT}")
    
    yield
    
    # Shutdown
    logger.info("👋 Shutting down RAG service...")


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="CodeMap RAG Service",
    description="Agentic RAG pipeline with LLM function calling for code search",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """
    Health check endpoint
    
    Returns service status and configuration validity
    """
    return HealthResponse(
        status="ok",
        service="rag-service",
        config_valid=config.is_valid(),
    )


@app.post(
    "/query",
    response_model=QueryResponse,
    status_code=status.HTTP_200_OK,
    tags=["RAG"],
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def agentic_query(request: QueryRequest) -> QueryResponse:
    """
    Agentic RAG query endpoint
    
    The LLM decides whether to search the codebase based on the query:
    - General programming questions: Direct answer without code search
    - Code-specific questions: Searches codebase and provides answer with sources
    
    Args:
        request: Query request with query text and optional top_k
        
    Returns:
        QueryResponse with answer and optional source chunks
        
    Raises:
        HTTPException: For validation errors or service failures
    """
    # Validate configuration
    if not config.is_valid():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ERROR_MESSAGES["MISSING_API_KEY"],
        )
    
    try:
        # Execute agentic query
        rag_service = get_rag_service()
        result = await rag_service.agentic_query(request.query, request.top_k)
        
        # Convert to response model
        return QueryResponse(
            query=result.query,
            answer=result.answer,
            tool_used=result.tool_used,
            sources=[
                SourceChunk(**source) for source in result.sources
            ] if result.sources else None,
        )
    
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Query processing error: {error_msg}")
        
        # Handle rate limit errors
        if "RATE_LIMIT" in error_msg or "429" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again later.",
            )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process query: {error_msg}",
        )


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=config.FLASK_ENV == "development",
        log_level="info",
    )
