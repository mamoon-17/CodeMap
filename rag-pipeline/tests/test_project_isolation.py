"""
Project isolation tests for RagService.agentic_query().

Validates two contracts:
1. agentic_query() refuses to run without a project_id (defense-in-depth
   beyond the QueryRequest Pydantic validator).
2. When a project_id is supplied, retrieval is scoped to that project —
   the underlying retrieve_similar_chunks is called with the same id.

These tests use mocks for the LLM and the raw embedder so they can run
without an OpenAI key or a populated Chroma DB.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.types_models import ToolCall
from services.rag_service import RagService


@pytest.mark.asyncio
async def test_query_requires_project_id():
    """Empty project_id should be rejected before any LLM/embedding work."""
    with patch("services.rag_service.get_llm_client"), \
         patch("services.rag_service.get_embedding_service"):
        service = RagService()
        with pytest.raises(ValueError):
            await service.agentic_query(query_text="any", project_id="")


@pytest.mark.asyncio
async def test_query_scoped_to_project():
    """Retrieval for project-a must call the embedder with project_id='project-a'."""
    fake_raw = [
        {
            "id": "c1",
            "score": 0.9,
            "metadata": {
                "file_path": "src/a.py",
                "start_line": 1,
                "project_id": "project-a",
            },
            "text": "def a(): ...",
        },
        {
            "id": "c2",
            "score": 0.8,
            "metadata": {
                "file_path": "src/b.py",
                "start_line": 1,
                "project_id": "project-a",
            },
            "text": "def b(): ...",
        },
    ]

    mock_llm = MagicMock()
    mock_llm.generate_with_tools = AsyncMock(return_value={
        "type": "tool_call",
        "call": ToolCall(name="retrieve_code_chunks", args={"query": "anything"}),
    })
    mock_llm.generate_with_tool_result = AsyncMock(return_value="mocked answer")

    with patch("services.rag_service.get_llm_client", return_value=mock_llm), \
         patch(
             "services.embedding_service.retrieve_similar_chunks",
             return_value=fake_raw,
         ) as mock_retrieve:
        service = RagService()
        result = await service.agentic_query(
            query_text="anything",
            top_k=2,
            project_id="project-a",
        )

    assert result.tool_used is True
    assert result.sources is not None
    assert len(result.sources) == 2

    mock_retrieve.assert_called()
    call_kwargs = mock_retrieve.call_args.kwargs
    assert call_kwargs.get("project_id") == "project-a", (
        f"embedder was called with project_id={call_kwargs.get('project_id')!r}, "
        f"expected 'project-a'"
    )
