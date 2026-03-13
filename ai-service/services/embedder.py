from sentence_transformers import SentenceTransformer
import chromadb
from sqlalchemy.orm import Session
from services.db import engine
from models.db_models import Chunk

model = SentenceTransformer('all-MiniLM-L6-v2')
chroma_client = chromadb.PersistentClient(path="./chroma_db")

def get_or_create_collection(project_id):
    return chroma_client.get_or_create_collection(
        name=f"project_{project_id}"
    )

def embed_and_store(chunk_ids, project_id):
    with Session(engine) as session:
        chunks = session.query(Chunk).filter(
            Chunk.id.in_(chunk_ids)
        ).all()

        collection = get_or_create_collection(project_id)

        for chunk in chunks:
            embedding = model.encode(chunk.rawText).tolist()

            collection.add(
                ids=[chunk.id],
                embeddings=[embedding],
                documents=[chunk.rawText],
                metadatas=[{
                    "file_path": chunk.filePath,
                    "start_line": chunk.startLine,
                    "end_line": chunk.endLine,
                    "project_id": project_id
                }]
            )

            chunk.vectorId = chunk.id
            session.add(chunk)

        session.commit()
        return {"embedded": len(chunks)}