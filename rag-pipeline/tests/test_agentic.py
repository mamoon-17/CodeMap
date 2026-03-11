"""
Agentic RAG Test Suite
Tests the tool-calling workflow where LLM decides whether to search the codebase

Prerequisites:
1. RAG service running: uvicorn app:app --reload --port 5001
2. Valid OPENAI_API_KEY in .env

Run: pytest test_agentic.py -v
"""
import pytest
import httpx


RAG_SERVICE_URL = "http://localhost:5001"


class TestAgenticBehavior:
    """Tests for agentic decision-making in RAG pipeline"""
    
    @pytest.mark.asyncio
    async def test_service_availability(self):
        """Verify RAG service is running"""
        async with httpx.AsyncClient(base_url=RAG_SERVICE_URL, timeout=10.0) as client:
            try:
                response = await client.get("/health")
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "ok"
                print("✅ RAG service is running")
            except Exception as e:
                pytest.fail(f"❌ RAG service is NOT running: {e}\n   Start: uvicorn app:app --reload")
    
    @pytest.mark.asyncio
    async def test_general_question_without_tool(self):
        """General question should NOT use tool"""
        async with httpx.AsyncClient(base_url=RAG_SERVICE_URL, timeout=30.0) as client:
            response = await client.post(
                "/query",
                json={
                    "query": "What is recursion in programming?",
                    "top_k": 3
                }
            )
            
            if response.status_code == 429:
                pytest.skip("Rate limit hit - OpenAI rate limit")
            
            assert response.status_code == 200
            data = response.json()
            
            assert data["tool_used"] is False, "Tool should NOT be used for general questions"
            assert len(data["answer"]) > 0, "Answer should not be empty"
            
            print(f"   → Tool used: {data['tool_used']}")
            print(f"   → Answer preview: {data['answer'][:80]}...")
    
    @pytest.mark.asyncio
    async def test_code_specific_question_with_tool(self):
        """Code-specific question SHOULD use tool"""
        async with httpx.AsyncClient(base_url=RAG_SERVICE_URL, timeout=30.0) as client:
            response = await client.post(
                "/query",
                json={
                    "query": "How does the query service handle errors?",
                    "top_k": 3
                }
            )
            
            if response.status_code == 429:
                pytest.skip("Rate limit hit - OpenAI rate limit")
            
            assert response.status_code == 200
            data = response.json()
            
            assert data["tool_used"] is True, "Tool SHOULD be used for code questions"
            assert data["sources"] is not None, "Sources should be present"
            assert len(data["sources"]) > 0, "Should have at least one source"
            assert len(data["answer"]) > 0, "Answer should not be empty"
            
            print(f"   → Tool used: {data['tool_used']}")
            print(f"   → Sources found: {len(data['sources'])}")
            print(f"   → Answer preview: {data['answer'][:80]}...")
    
    @pytest.mark.asyncio
    async def test_empty_query_validation(self):
        """Empty query should be rejected"""
        async with httpx.AsyncClient(base_url=RAG_SERVICE_URL, timeout=10.0) as client:
            response = await client.post(
                "/query",
                json={"query": "", "top_k": 3}
            )
            
            assert response.status_code == 422
            print("   → Empty query correctly rejected")
    
    @pytest.mark.asyncio
    async def test_invalid_top_k_validation(self):
        """Invalid top_k should be rejected"""
        async with httpx.AsyncClient(base_url=RAG_SERVICE_URL, timeout=10.0) as client:
            response = await client.post(
                "/query",
                json={"query": "test", "top_k": 100}
            )
            
            assert response.status_code == 422
            print("   → Invalid top_k correctly rejected")
    
    @pytest.mark.asyncio
    async def test_response_structure_complete(self):
        """Response structure should be valid and complete"""
        async with httpx.AsyncClient(base_url=RAG_SERVICE_URL, timeout=30.0) as client:
            response = await client.post(
                "/query",
                json={
                    "query": "Explain the LLM client implementation",
                    "top_k": 2
                }
            )
            
            if response.status_code == 429:
                pytest.skip("Rate limit hit")
            
            assert response.status_code == 200
            data = response.json()
            
            # Validate required fields
            assert "query" in data and isinstance(data["query"], str)
            assert "answer" in data and isinstance(data["answer"], str)
            assert "tool_used" in data and isinstance(data["tool_used"], bool)
            
            # If tool was used, validate sources
            if data["tool_used"]:
                assert "sources" in data
                assert isinstance(data["sources"], list)
                
                if len(data["sources"]) > 0:
                    source = data["sources"][0]
                    assert "file" in source and isinstance(source["file"], str)
                    assert "text" in source and isinstance(source["text"], str)
                    assert "score" in source and isinstance(source["score"], (int, float))
                    assert "chunk_index" in source and isinstance(source["chunk_index"], int)
            
            print("   → All fields valid ✓")
    
    @pytest.mark.asyncio
    async def test_tool_decision_consistency(self):
        """Test that similar queries get consistent tool decisions"""
        queries = [
            ("What is a linked list?", False),  # General - no tool
            ("Show me the authentication code", True),  # Code-specific - use tool
            ("Explain how callbacks work", False),  # General - no tool
        ]
        
        async with httpx.AsyncClient(base_url=RAG_SERVICE_URL, timeout=30.0) as client:
            for query, expected_tool_use in queries:
                response = await client.post(
                    "/query",
                    json={"query": query, "top_k": 3}
                )
                
                if response.status_code == 429:
                    pytest.skip("Rate limit hit")
                
                assert response.status_code == 200
                data = response.json()
                
                assert data["tool_used"] == expected_tool_use, \
                    f"Query '{query}' expected tool_used={expected_tool_use}, got {data['tool_used']}"
                
                print(f"   → '{query[:40]}...' → tool_used={data['tool_used']} ✓")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--asyncio-mode=auto"])
