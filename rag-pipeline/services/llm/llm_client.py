"""
LLM Client for interacting with GitHub Models API (OpenAI-compatible)
Handles agentic RAG with function calling
"""
import logging
from typing import Union, Optional
import json
from openai import AsyncOpenAI

from config import config
from constants import LLM_CONFIG, RETRIEVE_CODE_CHUNKS_TOOL, ERROR_MESSAGES
from models.types_models import Chunk, ToolCall
from services.llm.output_parser import parse_json_object, LlmOutputParseError

logger = logging.getLogger(__name__)

# GitHub Models API endpoint
GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference"


class LlmClient:
    """Client for LLM operations with GitHub Models API"""
    
    def __init__(self):
        """Initialize the LLM client with GitHub Models API"""
        if not config.OPENAI_API_KEY:
            raise ValueError(ERROR_MESSAGES["MISSING_API_KEY"])
        
        # Use GitHub Models API with OpenAI-compatible client
        self.client = AsyncOpenAI(
            api_key=config.OPENAI_API_KEY,
            base_url=GITHUB_MODELS_BASE_URL,
        )
        self.model = LLM_CONFIG["MODEL"]
    
    def _is_rate_limit_error(self, error: Exception) -> bool:
        """Check if error is a rate limit error (429)"""
        error_msg = str(error).lower()
        return any(
            keyword in error_msg
            for keyword in ["429", "rate_limit", "quota", "too many requests"]
        )
    
    async def generate_with_tools(
        self, user_query: str
    ) -> Union[dict[str, str], dict[str, ToolCall]]:
        """
        Agentic generation: LLM decides whether to call retrieve_code_chunks
        Returns either a direct answer OR a tool call request
        
        Returns:
            {"type": "answer", "text": str} OR
            {"type": "tool_call", "call": ToolCall}
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful coding assistant that analyzes codebases. When asked about specific code implementation or files, use the retrieve_code_chunks function. For general programming questions, answer directly without using tools."
                    },
                    {
                        "role": "user",
                        "content": user_query
                    }
                ],
                tools=[RETRIEVE_CODE_CHUNKS_TOOL],
                tool_choice="auto",
                temperature=LLM_CONFIG["TEMPERATURE"],
            )
            
            message = response.choices[0].message
            
            # Check if LLM called a function
            if message.tool_calls:
                tool_call = message.tool_calls[0]
                function_name = tool_call.function.name
                function_args = json.loads(tool_call.function.arguments)
                
                return {
                    "type": "tool_call",
                    "call": ToolCall(
                        name=function_name,
                        args=function_args,
                    ),
                }
            
            # Otherwise, return direct answer
            text = message.content
            if not text:
                raise ValueError("No text content in LLM response")
            
            return {"type": "answer", "text": text}
        
        except Exception as e:
            if self._is_rate_limit_error(e):
                logger.error(f"⏸️  Rate limit exceeded: {e}")
                raise Exception(f"RATE_LIMIT: {str(e)}")
            raise Exception(f"Failed to generate with tools: {str(e)}")
    
    async def generate_with_tool_result(
        self, user_query: str, chunks: list[Chunk]
    ) -> str:
        """
        Second LLM call after tool execution with retrieved chunks
        
        Args:
            user_query: Original user query
            chunks: Retrieved code chunks
            
        Returns:
            Generated answer based on chunks
        """
        try:
            # Format chunks for the LLM
            chunks_text = "\n\n".join([
                f"File: {c.metadata.file}\nScore: {c.score}\nCode:\n{c.metadata.text}"
                for c in chunks
            ])
            
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful coding assistant. Use the provided code chunks to answer the user's question accurately. Reference specific files and explain the code clearly."
                    },
                    {
                        "role": "user",
                        "content": user_query
                    },
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_retrieve",
                                "type": "function",
                                "function": {
                                    "name": "retrieve_code_chunks",
                                    "arguments": json.dumps({"query": user_query})
                                }
                            }
                        ]
                    },
                    {
                        "role": "tool",
                        "tool_call_id": "call_retrieve",
                        "content": f"Found {len(chunks)} relevant code chunks:\n\n{chunks_text}"
                    }
                ],
                temperature=LLM_CONFIG["TEMPERATURE"],
            )
            
            text = response.choices[0].message.content
            if not text:
                raise ValueError("No text content in LLM response")
            
            return text
        
        except Exception as e:
            if self._is_rate_limit_error(e):
                logger.error(f"⏸️  Rate limit exceeded: {e}")
                raise Exception(f"RATE_LIMIT: {str(e)}")
            raise Exception(f"Failed to generate with tool result: {str(e)}")

    async def analyze_snippet(self, file_path: str, code: str) -> dict[str, str]:
        """
        Analyze a code snippet and return structured output.

        Returns a dict with:
          - summary: str
          - explanation: str
        """
        if not file_path or not file_path.strip():
            raise ValueError("file_path is required")
        if not code or not code.strip():
            raise ValueError("code is required")

        system_prompt = (
            "You are a senior code review assistant.\n"
            "You will be given a file path and a code snippet from that file.\n"
            "Return ONLY valid JSON (no markdown, no extra text) with exactly these keys:\n"
            '{ "summary": string, "explanation": string }\n'
            "\n"
            "Formatting rules:\n"
            "- summary: 1-3 short sentences, concrete, no speculation.\n"
            "- explanation: concise but specific; reference identifiers exactly as written.\n"
            "- If info is missing, say what is missing instead of guessing.\n"
        )

        user_prompt = (
            f"File path: {file_path}\n\n"
            "Code:\n"
            "```text\n"
            f"{code}\n"
            "```"
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
            )

            text = response.choices[0].message.content
            if not text:
                raise ValueError("No text content in LLM response")

            obj = parse_json_object(text)
            summary = obj.get("summary")
            explanation = obj.get("explanation")
            if not isinstance(summary, str) or not isinstance(explanation, str):
                raise LlmOutputParseError("JSON must contain 'summary' and 'explanation' strings")

            return {"summary": summary.strip(), "explanation": explanation.strip()}
        except LlmOutputParseError as e:
            raise Exception(f"Failed to parse LLM output: {str(e)}")
        except Exception as e:
            if self._is_rate_limit_error(e):
                logger.error(f"⏸️  Rate limit exceeded: {e}")
                raise Exception(f"RATE_LIMIT: {str(e)}")
            raise Exception(f"Failed to analyze snippet: {str(e)}")


# Global instance
llm_client: Optional[LlmClient] = None

def get_llm_client() -> LlmClient:
    """Get or create LLM client instance"""
    global llm_client
    if llm_client is None:
        llm_client = LlmClient()
    return llm_client
