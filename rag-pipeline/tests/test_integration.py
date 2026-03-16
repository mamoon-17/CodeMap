"""
Integration Tests for CodeMap RAG Service
Tests the complete agentic RAG pipeline with FastAPI
"""
import pytest
import httpx


class TestHealthEndpoint:
    """Tests for health check endpoint"""
    
    @pytest.mark.asyncio
    async def test_health_check(self, async_client: httpx.AsyncClient):
        """Health endpoint should return ok status"""
        response = await async_client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "rag-service"
        assert "config_valid" in data


class TestEmbeddingService:
    """Tests for embedding/vector search functionality"""
    
    @pytest.mark.asyncio
    async def test_mock_chunks_retrieval(self, async_client: httpx.AsyncClient):
        """Should retrieve mock code chunks"""
        # Note: This tests through the full RAG pipeline
        response = await async_client.post(
            "/query",
            json={"query": "How is authentication handled?", "top_k": 3}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # If tool was used, sources should be present
        if data["tool_used"]:
            assert "sources" in data
            if data["sources"]:
                assert len(data["sources"]) <= 3
                # Validate source structure
                source = data["sources"][0]
                assert "file" in source
                assert "chunk_index" in source
                assert "score" in source
                assert "text" in source


class TestAgenticRAGPipeline:
    """Tests for the agentic RAG query endpoint"""
    
    @pytest.mark.asyncio
    async def test_general_question_no_tool(self, async_client: httpx.AsyncClient):
        """General programming questions should NOT use the tool"""
        response = await async_client.post(
            "/query",
            json={
                "query": "What is recursion in programming?",
                "top_k": 3
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["tool_used"] is False
        assert len(data["answer"]) > 0
        assert data["query"] == "What is recursion in programming?"
    
    @pytest.mark.asyncio
    async def test_code_specific_question_uses_tool(self, async_client: httpx.AsyncClient):
        """Code-specific questions SHOULD use the tool"""
        response = await async_client.post(
            "/query",
            json={
                "query": "Where is user authentication handled in the codebase?",
                "top_k": 3
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["tool_used"] is True
        assert "sources" in data
        assert data["sources"] is not None
        assert len(data["sources"]) > 0
        assert len(data["answer"]) > 0
    
    @pytest.mark.asyncio
    async def test_response_structure_validation(self, async_client: httpx.AsyncClient):
        """Response should have valid structure"""
        response = await async_client.post(
            "/query",
            json={
                "query": "Explain the LLM client implementation",
                "top_k": 2
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Validate required fields
        assert "query" in data
        assert isinstance(data["query"], str)
        assert "answer" in data
        assert isinstance(data["answer"], str)
        assert "tool_used" in data
        assert isinstance(data["tool_used"], bool)
        
        # Validate sources if tool was used
        if data["tool_used"] and data.get("sources"):
            sources = data["sources"]
            assert isinstance(sources, list)
            
            if len(sources) > 0:
                source = sources[0]
                assert "file" in source
                assert "chunk_index" in source
                assert "score" in source
                assert "text" in source
                assert isinstance(source["chunk_index"], int)
                assert isinstance(source["score"], (int, float))


class TestRequestValidation:
    """Tests for request validation"""
    
    @pytest.mark.asyncio
    async def test_empty_query_rejected(self, async_client: httpx.AsyncClient):
        """Empty query should return 400 error"""
        response = await async_client.post(
            "/query",
            json={"query": ""}
        )
        
        assert response.status_code == 422  # FastAPI validation error
    
    @pytest.mark.asyncio
    async def test_whitespace_only_query_rejected(self, async_client: httpx.AsyncClient):
        """Whitespace-only query should return 400 error"""
        response = await async_client.post(
            "/query",
            json={"query": "   "}
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_invalid_top_k_too_large(self, async_client: httpx.AsyncClient):
        """top_k > 20 should return 400 error"""
        response = await async_client.post(
            "/query",
            json={"query": "test", "top_k": 100}
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_invalid_top_k_too_small(self, async_client: httpx.AsyncClient):
        """top_k < 1 should return 400 error"""
        response = await async_client.post(
            "/query",
            json={"query": "test", "top_k": 0}
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_default_top_k(self, async_client: httpx.AsyncClient):
        """Should use default top_k when not specified"""
        response = await async_client.post(
            "/query",
            json={"query": "test query"}
        )
        
        # Should succeed with default value
        assert response.status_code in [200, 429]  # 429 if rate limited
    
    @pytest.mark.asyncio
    async def test_missing_query_field(self, async_client: httpx.AsyncClient):
        """Missing query field should return 400 error"""
        response = await async_client.post(
            "/query",
            json={"top_k": 5}
        )
        
        assert response.status_code == 422


class TestRateLimiting:
    """Tests for rate limit handling"""
    
    @pytest.mark.asyncio
    async def test_rate_limit_error_handling(self, async_client: httpx.AsyncClient):
        """Rate limit errors should return 429 status"""
        # This test might not trigger rate limits in normal testing
        # but validates the error handling structure
        response = await async_client.post(
            "/query",
            json={"query": "What is the LLM configuration?", "top_k": 2}
        )
        
        # Should either succeed or return rate limit error
        assert response.status_code in [200, 429]
        
        if response.status_code == 429:
            data = response.json()
            assert "detail" in data


class TestDataStructure:
    """Tests for data structure validation"""
    
    @pytest.mark.asyncio
    async def test_source_chunk_structure(self, async_client: httpx.AsyncClient):
        """Source chunks should have correct structure"""
        response = await async_client.post(
            "/query",
            json={
                "query": "Show me the authentication middleware",
                "top_k": 2
            }
        )
        
        assert response.status_code in [200, 429]
        
        if response.status_code == 200:
            data = response.json()
            
            if data["tool_used"] and data.get("sources"):
                for source in data["sources"]:
                    # Validate all required fields exist
                    assert "file" in source
                    assert "chunk_index" in source
                    assert "score" in source
                    assert "text" in source
                    
                    # Validate types
                    assert isinstance(source["file"], str)
                    assert isinstance(source["chunk_index"], int)
                    assert isinstance(source["score"], (int, float))
                    assert isinstance(source["text"], str)
                    
                    # Validate reasonable values
                    assert len(source["file"]) > 0
                    assert source["chunk_index"] >= 0
                    assert 0.0 <= source["score"] <= 1.0
                    assert len(source["text"]) > 0
