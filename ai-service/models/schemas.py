from pydantic import BaseModel
from typing import List

class ChunkInput(BaseModel):
    chunk_ids: List[str]
    project_id: str