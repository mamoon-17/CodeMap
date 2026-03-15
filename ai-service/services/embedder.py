from sentence_transformers import SentenceTransformer
import chromadb
from services.chunker import chunk_file

model = SentenceTransformer('all-MiniLM-L6-v2')
chroma_client = chromadb.PersistentClient(path="./chroma_db")

def get_or_create_collection(project_id):
    return chroma_client.get_or_create_collection(
        name=f"project_{project_id}"
    )

def ingest_and_embed(files, project_id):
    collection = get_or_create_collection(project_id)
    total_chunks = 0

    for file in files:
        chunks = chunk_file(file.file_path, file.content)

        for chunk in chunks:
            embedding = model.encode(chunk["text"]).tolist()
            chunk_id = f"{project_id}_{chunk['file_path']}_{chunk['start_line']}"

            collection.add(
                ids=[chunk_id],
                embeddings=[embedding],
                documents=[chunk["text"]],
                metadatas=[{
                    "file_path": chunk["file_path"],
                    "start_line": chunk["start_line"],
                    "end_line": chunk["end_line"],
                    "project_id": project_id
                }]
            )
            total_chunks += 1

    return {"indexed": total_chunks}