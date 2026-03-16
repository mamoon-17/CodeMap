"""
Type definitions and data models for the RAG service
"""
from typing import Any, Optional
from dataclasses import dataclass


@dataclass
class ChunkMetadata:
    """Metadata for a code chunk"""
    file: str
    chunk_index: int
    text: str


@dataclass
class Chunk:
    """Code chunk with similarity score"""
    id: str
    score: float
    metadata: ChunkMetadata
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "score": self.score,
            "metadata": {
                "file": self.metadata.file,
                "chunk_index": self.metadata.chunk_index,
                "text": self.metadata.text,
            },
        }


@dataclass
class ToolCall:
    """LLM tool/function call"""
    name: str
    args: dict[str, Any]


@dataclass
class AgenticQueryResult:
    """Result from agentic RAG query"""
    query: str
    answer: str
    tool_used: bool
    sources: Optional[list[dict[str, Any]]] = None
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        result = {
            "query": self.query,
            "answer": self.answer,
            "tool_used": self.tool_used,
        }
        if self.sources is not None:
            result["sources"] = self.sources
        return result