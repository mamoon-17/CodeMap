"""
Embedding Service - Handles vector search for code chunks
"""
import logging

from models.types_models import Chunk, ChunkMetadata
from services.embedder import retrieve_similar_chunks

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Service for retrieving relevant code chunks via vector search"""
    
    def __init__(self):
        """Initialize embedding service"""
        logger.info("Embedding service initialized (ChromaDB retrieval)")
    
    async def retrieve_chunks(
        self,
        query_text: str,
        top_k: int,
        project_id: str,
    ) -> list[Chunk]:
        """
        Retrieve relevant code chunks for a query
        
        Args:
            query_text: Search query
            top_k: Number of chunks to return
            project_id: Project identifier used to scope retrieval
            
        Returns:
            List of relevant code chunks
        """
        logger.info(
            f"Retrieving chunks for project '{project_id}' query: '{query_text}' (top_k={top_k})"
        )

        raw_matches = retrieve_similar_chunks(
            query_text=query_text,
            top_k=top_k,
            project_id=project_id,
        )
        chunks = []
        for raw in raw_matches:
            metadata = raw.get("metadata") or {}
            start_line = int(metadata.get("start_line", 0))
            file_path = metadata.get("file_path", "")
            text = raw.get("text", "")
            chunk = Chunk(
                id=str(raw.get("id", "")),
                score=float(raw.get("score", 0.0)),
                metadata=ChunkMetadata(
                    file=file_path,
                    chunk_index=start_line,
                    text=text,
                ),
            )
            chunks.append(chunk)
        
        logger.info(f"Retrieved {len(chunks)} chunks")
        return chunks


# Global instance
embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    """Get or create embedding service instance"""
    global embedding_service
    if embedding_service is None:
        embedding_service = EmbeddingService()
    return embedding_service
