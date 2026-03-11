"""
RAG Service - Main agentic RAG pipeline
Coordinates LLM and embedding service for intelligent code search
"""
import logging
from typing_extensions import TypedDict

from services.llm.llm_client import get_llm_client
from services.embedding_service import get_embedding_service
from models.types_models import AgenticQueryResult
from constants import ERROR_MESSAGES

logger = logging.getLogger(__name__)


class RagService:
    """Main RAG service coordinating LLM and embedding operations"""
    
    def __init__(self):
        """Initialize RAG service with LLM and embedding clients"""
        self.llm_client = get_llm_client()
        self.embedding_service = get_embedding_service()
        logger.info("RAG service initialized")
    
    async def agentic_query(
        self, query_text: str, top_k: int = 5
    ) -> AgenticQueryResult:
        """
        Main query method - LLM decides whether to search the codebase
        
        Args:
            query_text: User's query
            top_k: Number of chunks to retrieve if tool is called
            
        Returns:
            AgenticQueryResult with answer and optional sources
        """
        logger.info(f"Processing agentic query: '{query_text}'")
        
        # Step 1: First LLM call with tool definition
        first_response = await self.llm_client.generate_with_tools(query_text)
        
        # Case 1: LLM answered directly without calling the tool
        if first_response["type"] == "answer":
            logger.info("LLM answered directly without tool use")
            return AgenticQueryResult(
                query=query_text,
                answer=first_response["text"],
                tool_used=False,
            )
        
        # Case 2: LLM called the retrieve_code_chunks tool
        if first_response["type"] == "tool_call":
            tool_call = first_response["call"]
            logger.info(f"LLM called tool: {tool_call.name}")
            
            # Validate tool call
            if tool_call.name != "retrieve_code_chunks":
                raise ValueError(f"Unknown tool called: {tool_call.name}")
            
            search_query = tool_call.args.get("query")
            if not search_query:
                raise ValueError("Tool call missing 'query' argument")
            
            # Execute the retrieval
            chunks = await self.embedding_service.retrieve_chunks(
                search_query, top_k
            )
            
            # Handle no chunks found
            if not chunks or len(chunks) == 0:
                logger.warning("No chunks found for query")
                return AgenticQueryResult(
                    query=query_text,
                    answer=ERROR_MESSAGES["NO_RESULTS"],
                    tool_used=True,
                    sources=[],
                )
            
            # Step 2: Second LLM call with retrieved chunks
            logger.info(f"Sending {len(chunks)} chunks to LLM for final answer")
            final_answer = await self.llm_client.generate_with_tool_result(
                query_text, chunks
            )
            
            # Step 3: Return final answer with sources
            sources = [
                {
                    "file": c.metadata.file,
                    "chunk_index": c.metadata.chunk_index,
                    "score": c.score,
                    "text": c.metadata.text,
                }
                for c in chunks
            ]
            
            return AgenticQueryResult(
                query=query_text,
                answer=final_answer,
                tool_used=True,
                sources=sources,
            )
        
        # Should never reach here
        raise ValueError("Unexpected response type from LLM")


# Global instance
rag_service: RagService | None = None


def get_rag_service() -> RagService:
    """Get or create RAG service instance"""
    global rag_service
    if rag_service is None:
        rag_service = RagService()
    return rag_service
