"""
CodeMap - RAG Service (FastAPI)
Agentic RAG pipeline with LLM function calling and vector search

This service combines:
- OpenAI LLM with function calling
- Vector search for code chunks via ChromaDB and sentence-transformers
- Async operations with type safety
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import config
from models.schemas import HealthResponse
from routers.ingest import router as ingest_router
from routers.projects import router as projects_router
from routers.query import router as query_router
from services.rag_service import get_rag_service
from services.chunk_store import init_db

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
        init_db()
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

app.include_router(query_router)
app.include_router(ingest_router)
app.include_router(projects_router)

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
