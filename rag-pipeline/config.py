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
        
    def validate(self) -> list[str]:
        """Validate required configuration"""
        missing = []
        if not self.OPENAI_API_KEY:
            missing.append("OPENAI_API_KEY")
        return missing
    
    def is_valid(self) -> bool:
        """Check if configuration is valid"""
        return len(self.validate()) == 0


# Global config instance
config = Config()
