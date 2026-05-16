"""
Configuration management for the RAG service
Loads environment variables and provides config access
"""
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Configuration class for RAG service"""
    
    def __init__(self):
        self.OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
        self.PORT: int = int(os.getenv("PORT", "5001"))
        self.FLASK_ENV: str = os.getenv("FLASK_ENV", "development")
        self.VECTOR_DB_URL: Optional[str] = os.getenv("VECTOR_DB_URL")

        # Supabase credentials — used by the storage-based ingest flow to
        # download ZIP archives and delete them after successful indexing.
        self.SUPABASE_URL: Optional[str] = os.getenv("SUPABASE_URL")
        self.SUPABASE_SERVICE_ROLE_KEY: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.SUPABASE_STORAGE_BUCKET: str = os.getenv(
            "SUPABASE_STORAGE_BUCKET", "codemap-projects"
        )

        # Timeout values in seconds. Increase if large repos cause
        # gateway timeouts. Node.js axios timeout must match or exceed these.
        self.RAG_REQUEST_TIMEOUT: int = int(os.getenv("RAG_REQUEST_TIMEOUT", "120"))
        self.INGEST_TIMEOUT: int = int(os.getenv("INGEST_TIMEOUT", "300"))
        self.EMBED_TIMEOUT: int = int(os.getenv("EMBED_TIMEOUT", "60"))
        
    def validate(self) -> list[str]:
        """Validate required configuration"""
        missing = []
        if not self.OPENAI_API_KEY:
            missing.append("OPENAI_API_KEY")
        if not self.SUPABASE_URL:
            missing.append("SUPABASE_URL")
        if not self.SUPABASE_SERVICE_ROLE_KEY:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        return missing
    
    def is_valid(self) -> bool:
        """Check if configuration is valid"""
        return len(self.validate()) == 0


# Global config instance
config = Config()
