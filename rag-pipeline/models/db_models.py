"""SQLAlchemy models for persisted chunk metadata."""
import uuid

from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base declarative model."""


class ChunkRecord(Base):
    """Chunk metadata persisted in relational storage."""

    __tablename__ = "Chunk"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId = Column(String, nullable=False)
    filePath = Column(String, nullable=False)
    startLine = Column(Integer, nullable=False)
    endLine = Column(Integer, nullable=False)
    rawText = Column(Text, nullable=False)
    vectorId = Column(String, nullable=True)
