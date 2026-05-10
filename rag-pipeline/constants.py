"""
Constants for the RAG service
"""

# Query constraints
QUERY_CONSTRAINTS = {
    "MIN_TOP_K": 1,
    "MAX_TOP_K": 20,
    "DEFAULT_TOP_K": 5,
}

# Retrieval quality thresholds (used by is_low_signal_retrieval)
RETRIEVAL_THRESHOLDS = {
    "ABSOLUTE_MIN_SCORE": 0.25,
    "SOFT_MIN_SCORE": 0.33,
    "SOFT_MAX_SPREAD": 0.03,
    "MIN_RETURN_SCORE": 0.1,
}

# LLM configuration
LLM_CONFIG = {
    "MODEL": "gpt-4o-mini",  # Fast and cost-effective
    "MAX_TOKENS": 2048,
    "TEMPERATURE": 0.0,  # Deterministic for code analysis
}

# Error messages
ERROR_MESSAGES = {
    "QUERY_REQUIRED": "'query' field is required and must be a non-empty string.",
    "INVALID_TOP_K": "'top_k' must be between 1 and 20.",
    "EMBEDDING_SERVICE_UNAVAILABLE": "Embedding service unavailable. Please try again later.",
    "NO_RESULTS": "No relevant code was found in the repository for your query.",
    "MISSING_API_KEY": "OPENAI_API_KEY not configured. Please set it in .env file.",
}

# Tool definitions for LLM (OpenAI function calling format)
RETRIEVE_CODE_CHUNKS_TOOL = {
    "type": "function",
    "function": {
        "name": "retrieve_code_chunks",
        "description": "Search the codebase for relevant source code. Use this when the user asks about specific functionality, files, implementation details, or anything that requires looking at the actual repository code. Do NOT use for general programming questions.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to find relevant code chunks",
                }
            },
            "required": ["query"],
        },
    },
}
