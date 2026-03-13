from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from models.db_models import Chunk
import os

load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"))

def store_chunks(chunks, project_id):
    with Session(engine) as session:
        chunk_ids = []
        
        for chunk in chunks:
            new_chunk = Chunk(
                projectId=project_id,
                filePath=chunk["file_path"],
                startLine=chunk["start_line"],
                endLine=chunk["end_line"],
                rawText=chunk["text"]
            )
            session.add(new_chunk)
            session.flush()
            chunk_ids.append(new_chunk.id)
        
        session.commit()
        return chunk_ids
    
