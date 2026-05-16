"""Supabase Storage helpers using service-role credentials.

Uses httpx for direct REST calls to the Supabase Storage API.
This avoids pulling in the full ``supabase-py`` SDK and its heavy
dependency tree.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from config import config

logger = logging.getLogger(__name__)

_STORAGE_API_VERSION = "v1"


def _headers() -> dict[str, str]:
    return {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY or "",
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY or ''}",
    }


def _object_url(bucket: str, object_path: str) -> str:
    base = (config.SUPABASE_URL or "").rstrip("/")
    return f"{base}/storage/{_STORAGE_API_VERSION}/object/{bucket}/{object_path}"


async def download_object(bucket: str, object_path: str) -> bytes:
    """Download an object from Supabase Storage and return raw bytes."""
    url = _object_url(bucket, object_path)
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(url, headers=_headers())
        resp.raise_for_status()
        return resp.content


async def delete_object(bucket: str, object_path: str) -> None:
    """Delete an object from Supabase Storage."""
    base = (config.SUPABASE_URL or "").rstrip("/")
    url = f"{base}/storage/{_STORAGE_API_VERSION}/object/{bucket}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(
            url,
            headers={**_headers(), "Content-Type": "application/json"},
            json={"prefixes": [object_path]},
        )
        resp.raise_for_status()
    logger.info("Deleted storage object %s/%s", bucket, object_path)
