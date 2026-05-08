"""
Unit tests with mocked OpenAI responses
These tests don't require a real API key
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

#  Add parent directory to path so we can import modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.llm.llm_client import LlmClient
from services.embedding_service import EmbeddingService
from services.rag_service import RagService


class TestLlmClientMocked:
    """Test LLM client with mocked OpenAI responses"""
    
    @pytest.mark.asyncio
    async def test_llm_client_initialization(self):
        """Should initialize LLM client"""
        with patch('services.llm.llm_client.AsyncOpenAI'):
            client = LlmClient()
            assert client is not None
            print("✓ LLM Client initialized")
    
    @pytest.mark.asyncio
    async def test_generate_with_tools_mocked(self):
        """Should generate response with mocked OpenAI"""
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message = MagicMock()
        mock_response.choices[0].message.content = "This is a test response"
        mock_response.choices[0].message.tool_calls = None
        mock_response.choices[0].finish_reason = "stop"
        
        with patch('services.llm.llm_client.AsyncOpenAI') as mock_openai:
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
            mock_openai.return_value = mock_client
            
            client = LlmClient()
            result = await client.generate_with_tools(
                "What is the query service?",
            )

            assert result is not None
            assert result.get("type") == "answer"
            assert result.get("text") == "This is a test response"
            print("✓ LLM Client generated response (mocked)")


class TestEmbeddingServiceMocked:
    """Test embedding service with mock data"""
    
    @pytest.mark.asyncio
    async def test_retrieve_chunks_mocked(self):
        """Should map embedder hits into Chunk models."""
        mock_raw = [
            {
                "id": "c1",
                "score": 0.9,
                "metadata": {
                    "file_path": "src/auth.ts",
                    "start_line": 1,
                    "project_id": "p1",
                },
                "text": "export function login() {}",
            },
        ]
        with patch(
            "services.embedding_service.retrieve_similar_chunks",
            return_value=mock_raw,
        ):
            service = EmbeddingService()
            chunks = await service.retrieve_chunks(
                "authentication", top_k=3, project_id="p1"
            )

        assert len(chunks) == 1
        assert chunks[0].metadata.text == mock_raw[0]["text"]
        assert chunks[0].metadata.file == "src/auth.ts"


class TestRagServiceMocked:
    """Test RAG service with mocked components"""
    
    @pytest.mark.asyncio
    async def test_rag_service_initialization(self):
        """Should initialize RAG service"""
        with patch('services.rag_service.get_llm_client'), \
             patch('services.rag_service.get_embedding_service'):
            service = RagService()
            assert service is not None
            print("✓ RAG Service initialized")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
