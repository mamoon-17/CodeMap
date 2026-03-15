from pydantic import BaseModel
from typing import List

class FileInput(BaseModel):
    file_path: str
    content: str

class IngestInput(BaseModel):
    project_id: str
    files: List[FileInput]