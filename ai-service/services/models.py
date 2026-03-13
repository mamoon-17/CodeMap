from sqlalchemy import Column, String, Integer, Text
from sqlalchemy.orm import DeclarativeBase
import uuid

class Base(DeclarativeBase):
    pass

class Chunk(Base):
    __tablename__ = "Chunk"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    projectId = Column(String, nullable=False)
    filePath = Column(String, nullable=False)
    startLine = Column(Integer, nullable=False)
    endLine = Column(Integer, nullable=False)
    rawText = Column(Text, nullable=False)
    vectorId = Column(String, nullable=True)