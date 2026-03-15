"""
Pydantic models for request/response schemas
"""
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
        """Validate project identifier is not empty after stripping"""
        if not v.strip():
            raise ValueError("project_id is required")
        return v.strip()


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
    """Request model for repository ingestion"""
    project_id: str
    files: list[FileInput]
    replace_project: bool = False


class IngestResponse(BaseModel):
    """Response model for ingestion"""
    indexed: int