"""
CodeMap - RAG Service (FastAPI)
Agentic RAG pipeline with LLM function calling and vector search

This service combines:
- OpenAI LLM with function calling
- Vector search for code chunks via ChromaDB and sentence-transformers
- Async operations with type safety
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

import anyio
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import config
from models.schemas import HealthResponse
from routers.ingest import router as ingest_router
from routers.projects import router as projects_router
from routers.query import router as query_router
from services.embedder import warmup_model
from services.rag_service import get_rag_service

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

    # Warm up the embedding model at startup.
    # On Windows + uvicorn reload, lazy-loading the model during a request
    # triggers an OSError [Errno 22] from tqdm's sys.stderr.flush(). Preloading
    # it here while stderr is still healthy avoids that.
    try:
        warmup_model()
        logger.info("✅ Embedding model warmed up")
    except Exception as e:
        logger.error(f"❌ Failed to warm up embedding model: {e}")
    
    logger.info(f"🎯 RAG service ready on port {config.PORT}")

    # Start self-ping keepalive (prevents Render cold starts)
    keepalive_task = asyncio.create_task(_self_ping_loop())
    
    yield
    
    # Shutdown
    keepalive_task.cancel()
    logger.info("👋 Shutting down RAG service...")


async def _self_ping_loop():
    """Ping own /health every 10 minutes to prevent Render cold starts."""
    interval = 10 * 60  # 10 minutes
    url = f"http://localhost:{config.PORT}/health"
    logger.info("[keepalive] Self-ping scheduled every %d min", interval // 60)
    while True:
        await asyncio.sleep(interval)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.get(url)
        except Exception:
            pass  # non-fatal


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="CodeMap RAG Service",
    description="Agentic RAG pipeline with LLM function calling for code search",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware — configurable via ALLOWED_ORIGINS env var for production.
# Falls back to local dev origins if not set.
_default_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]
_env_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
_origins = [o.strip() for o in _env_origins.split(",") if o.strip()] if _env_origins else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timeout_middleware(request: Request, call_next):
    from config import config
    path = request.url.path
    if path.startswith("/ingest"):
        timeout = config.INGEST_TIMEOUT
    elif path.startswith("/embed"):
        timeout = config.EMBED_TIMEOUT
    else:
        timeout = config.RAG_REQUEST_TIMEOUT
    try:
        # anyio.fail_after is a sync context manager (AnyIO 4+); async with is invalid.
        with anyio.fail_after(timeout):
            return await call_next(request)
    except TimeoutError:
        return JSONResponse(
            status_code=504,
            content={"error": "Request timed out",
                     "detail": f"Request exceeded {timeout}s limit"}
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
