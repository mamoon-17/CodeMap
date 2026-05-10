"""
RAG Service - Main agentic RAG pipeline
Coordinates LLM and embedding service for intelligent code search
"""
import logging
import re
from statistics import median

from services.llm.llm_client import get_llm_client
from services.embedding_service import get_embedding_service
from models.types_models import AgenticQueryResult, ToolCall
from constants import ERROR_MESSAGES, RETRIEVAL_THRESHOLDS

logger = logging.getLogger(__name__)


class RagService:
    """Main RAG service coordinating LLM and embedding operations"""
    
    def __init__(self):
        """Initialize RAG service with LLM and embedding clients"""
        self.llm_client = get_llm_client()
        self.embedding_service = get_embedding_service()
        logger.info("RAG service initialized")
    
    async def agentic_query(
        self,
        query_text: str,
        top_k: int = 5,
        project_id: str = "",
        language: str | None = None,
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

        def is_repo_question(q: str) -> bool:
            t = (q or "").strip().lower()
            if not t:
                return False
            patterns = [
                r"\bwhere\b.*\b(server|app|route|router|controller|entry|start|listen|bootstrap)\b",
                r"\b(entrypoint|bootstrap|startup|listen|routes?)\b",
                r"\b(config|datasource|middleware|auth)\b",
                r"\b(file|function|class|module)\b",
            ]
            return any(re.search(p, t) for p in patterns)

        def augment_search_query(q: str) -> str:
            t = (q or "").strip()
            low = t.lower()
            if "agentic" in low or "rag" in low or "tool" in low:
                return (
                    f"{t}\n"
                    "keywords: agentic_query rag_service.py RagService generate_with_tools generate_with_tool_result retrieve_code_chunks"
                )
            if "server" in low and ("start" in low or "started" in low or "listen" in low):
                return (
                    f"{t}\n"
                    "keywords: app.listen createServer server.ts main.ts index.ts express() fastapi uvicorn.run"
                )
            if "routes" in low or "router" in low:
                return f"{t}\nkeywords: app.use router routes.ts controller.ts"
            return t

        def is_low_signal_retrieval(scores: list[float]) -> tuple[bool, float, float]:
            if not scores:
                return True, 0.0, 0.0
            top_score = max(scores)
            med_score = float(median(scores))
            spread = top_score - min(scores)

            # Absolute minimum: if it's truly low similarity, don't let the LLM guess.
            # Soft low-signal: only if top is low-ish AND distribution is flat.
            # This avoids penalizing cases where all top-k are similarly relevant.
            low_signal = (
                top_score < RETRIEVAL_THRESHOLDS["ABSOLUTE_MIN_SCORE"]
                or (
                    top_score < RETRIEVAL_THRESHOLDS["SOFT_MIN_SCORE"]
                    and spread < RETRIEVAL_THRESHOLDS["SOFT_MAX_SPREAD"]
                )
            )

            logger.info(
                "retrieval_quality top=%.3f median=%.3f min=%.3f spread=%.3f low_signal=%s",
                top_score, med_score, min(scores), spread, low_signal
            )

            return low_signal, top_score, med_score

        # Step 1: First LLM call with tool definition
        first_response = await self.llm_client.generate_with_tools(
            query_text, project_id=project_id
        )
        
        # Case 1: LLM answered directly without calling the tool
        if first_response["type"] == "answer":
            if project_id and is_repo_question(query_text):
                logger.info("Repo-question answered directly; forcing retrieval for grounding")
                first_response = {
                    "type": "tool_call",
                    "call": ToolCall(
                        name="retrieve_code_chunks",
                        args={"query": augment_search_query(query_text)},
                    ),
                }
            else:
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

            search_query = augment_search_query(str(search_query))
            
            # Execute the retrieval
            chunks = await self.embedding_service.retrieve_chunks(
                search_query,
                top_k,
                project_id,
                language,
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

            logger.info(
                "chunk_scores scores=%s",
                [round(float(c.score), 3) for c in chunks]
            )

            # Relevance threshold handling (avoid low-signal hallucinations)
            scores = [float(c.score) for c in chunks if c and c.score is not None]
            if scores:
                logger.info(
                    "retrieval_metrics query='%s' project=%s chunks=%d "
                    "top=%.3f median=%.3f mean=%.3f min=%.3f",
                    query_text,
                    project_id,
                    len(chunks),
                    max(scores),
                    float(median(scores)),
                    sum(scores) / len(scores),
                    min(scores),
                )
            low_signal, top_score, med_score = is_low_signal_retrieval(scores)
            if low_signal:
                logger.warning(
                    "Low-signal retrieval (top_score=%.3f median=%.3f); returning scoped no-results",
                    top_score,
                    med_score,
                )
                suggestions = []
                low = query_text.lower()
                if "server" in low or "start" in low or "listen" in low:
                    suggestions = [
                        "server.ts app.listen",
                        "app.ts app.use routes",
                        "main.ts index.ts createServer",
                    ]
                elif "route" in low or "router" in low:
                    suggestions = [
                        "routes.ts router",
                        "app.ts app.use",
                        "controller.ts route handler",
                    ]
                elif "agentic" in low or "rag" in low or "tool" in low:
                    suggestions = [
                        "rag_service.py agentic_query",
                        "llm_client.py generate_with_tools",
                        "retrieve_code_chunks tool",
                    ]
                else:
                    suggestions = ["<feature keyword> file name", "<identifier> definition", "config env var name"]

                return AgenticQueryResult(
                    query=query_text,
                    answer=(
                        "I couldn’t find strongly relevant code for that question in this repository index.\n\n"
                        "Try one of these searches:\n"
                        + "\n".join([f"- {s}" for s in suggestions[:3]])
                    ),
                    tool_used=True,
                    sources=[
                        {
                            "file": c.metadata.file,
                            "chunk_index": c.metadata.chunk_index,
                            "score": c.score,
                            "text": c.metadata.text,
                        }
                        for c in chunks
                    ],
                )
            
            # Step 2: Second LLM call with retrieved chunks
            logger.info(f"Sending {len(chunks)} chunks to LLM for final answer")
            final_answer = await self.llm_client.generate_with_tool_result(
                query_text, chunks, project_id=project_id
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
