"""
Chunk metadata store (SQLite via SQLAlchemy).

This is used to:
- remove outdated chunk records on reindex
- validate that fresh indexing replaced old data
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from models.db_models import Base, ChunkRecord

DEFAULT_DB_URL = "sqlite:///./chunks.db"


def _db_url() -> str:
    return os.getenv("CHUNK_DB_URL", DEFAULT_DB_URL)


_engine = create_engine(_db_url(), future=True)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    Base.metadata.create_all(bind=_engine)


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def delete_project(project_id: str) -> None:
    with session_scope() as s:
        s.execute(delete(ChunkRecord).where(ChunkRecord.projectId == project_id))


def delete_file(project_id: str, file_path: str) -> None:
    with session_scope() as s:
        s.execute(
            delete(ChunkRecord).where(
                (ChunkRecord.projectId == project_id) & (ChunkRecord.filePath == file_path)
            )
        )


def upsert_chunks(project_id: str, file_path: str, chunks: list[dict]) -> int:
    """
    Replace chunks for a file by deleting then inserting fresh rows.
    """
    delete_file(project_id, file_path)
    rows = [
        ChunkRecord(
            projectId=project_id,
            filePath=file_path,
            startLine=int(c["start_line"]),
            endLine=int(c["end_line"]),
            rawText=str(c["text"]),
            vectorId=str(c.get("vector_id") or ""),
        )
        for c in chunks
    ]
    with session_scope() as s:
        s.add_all(rows)
    return len(rows)


def stats(project_id: str) -> dict[str, int]:
    with session_scope() as s:
        chunk_count = int(
            s.execute(
                select(func.count()).select_from(ChunkRecord).where(ChunkRecord.projectId == project_id)
            ).scalar_one()
        )
        file_count = int(
            s.execute(
                select(func.count(func.distinct(ChunkRecord.filePath))).where(ChunkRecord.projectId == project_id)
            ).scalar_one()
        )
        return {"files": file_count, "chunks": chunk_count}

