"""
Pydantic models for request/response schemas
"""
import re

from pydantic import BaseModel, Field, field_validator
from constants import QUERY_CONSTRAINTS, ERROR_MESSAGES


class QueryRequest(BaseModel):
    """Request model for agentic query"""
    query: str = Field(..., min_length=1, description="User's query text")
    top_k: int = Field(
        default=QUERY_CONSTRAINTS["DEFAULT_TOP_K"],
        ge=QUERY_CONSTRAINTS["MIN_TOP_K"],
        le=QUERY_CONSTRAINTS["MAX_TOP_K"],
        description="Number of code chunks to retrieve",
    )
    project_id: str = Field(..., min_length=1, description="Project identifier for scoped retrieval")
    language: str | None = None
    
    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        """Validate query is not empty after stripping"""
        if not v.strip():
            raise ValueError(ERROR_MESSAGES["QUERY_REQUIRED"])
        return v.strip()

    @field_validator("project_id")
    @classmethod
    def validate_project_id(cls, v: str) -> str:
        """Allow UUIDs, GitHub-linked ids (gh_…), and other backend project keys."""
        s = v.strip()
        if not s:
            raise ValueError("project_id is required")
        # Chroma collection names and metadata use this string; keep it URL/path safe.
        if len(s) > 256 or not re.fullmatch(r"[a-zA-Z0-9_.-]+", s):
            raise ValueError("project_id must be a non-empty alphanumeric id (max 256 chars)")
        return s

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        """Normalize and validate the optional language filter."""
        if v is None:
            return None
        normalized = v.strip().lower()
        if not normalized:
            return None
        allowed = {
            "python", "javascript", "typescript", "java", "cpp", "c",
            "go", "rust", "ruby", "php", "unknown",
        }
        if normalized not in allowed:
            raise ValueError("unsupported language filter")
        return normalized


class SourceChunk(BaseModel):
    """Source code chunk in response"""
    file: str
    chunk_index: int
    score: float
    text: str


class QueryResponse(BaseModel):
    """Response model for agentic query"""
    query: str
    answer: str
    tool_used: bool
    sources: list[SourceChunk] | None = None


class SnippetAnalysisRequest(BaseModel):
    """Request model for analyzing a single code snippet."""
    file_path: str = Field(..., min_length=1, description="Path of the file the snippet came from")
    code: str = Field(..., min_length=1, description="Code snippet content")

    @field_validator("file_path")
    @classmethod
    def validate_file_path(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("file_path is required")
        return v.strip()

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("code is required")
        return v


class SnippetAnalysisResponse(BaseModel):
    """Response model for snippet analysis."""
    file_path: str
    summary: str
    explanation: str


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    service: str
    config_valid: bool


class ErrorResponse(BaseModel):
    """Error response model"""
    error: str
    detail: str | None = None


class FileInput(BaseModel):
    """Single file payload for ingestion"""
    file_path: str
    content: str


class IngestInput(BaseModel):
    """Request model for repository ingestion (raw file payloads)"""
    project_id: str
    files: list[FileInput]
    replace_project: bool = False


class StorageIngestInput(BaseModel):
    """Request model for storage-based ingestion.

    Node.js uploads the raw ZIP to Supabase Storage and sends only
    the bucket + path.  FastAPI downloads, filters, indexes, and
    deletes the object on success.
    """
    project_id: str = Field(..., min_length=1, description="Project identifier")
    storage_bucket: str = Field(..., min_length=1, description="Supabase Storage bucket name")
    storage_path: str = Field(..., min_length=1, description="Object path inside the bucket")
    replace_project: bool = False

    @field_validator("project_id")
    @classmethod
    def validate_project_id_storage(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("project_id is required")
        if len(s) > 256 or not re.fullmatch(r"[a-zA-Z0-9_.-]+", s):
            raise ValueError("project_id must be a non-empty alphanumeric id (max 256 chars)")
        return s


class IngestResponse(BaseModel):
    """Response model for ingestion"""
    indexed: int
    file_count: int = 0