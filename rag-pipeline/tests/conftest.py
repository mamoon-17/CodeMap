"""
Pytest configuration and fixtures
"""
import pytest
import pytest_asyncio
import os
from typing import AsyncGenerator
import httpx


@pytest.fixture(scope="session")
def base_url() -> str:
    """Base URL for the RAG service"""
    return os.getenv("RAG_SERVICE_URL", "http://localhost:5001")


@pytest_asyncio.fixture(scope="function")
async def async_client(base_url: str) -> AsyncGenerator[httpx.AsyncClient, None]:
    """Async HTTP client for testing"""
    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        yield client
