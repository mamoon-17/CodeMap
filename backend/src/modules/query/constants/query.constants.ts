export const QUERY_CONSTRAINTS = {
  MIN_TOP_K: 1,
  MAX_TOP_K: 20,
  DEFAULT_TOP_K: 5,
} as const;

export const LLM_CONFIG = {
  MODEL: "gemini-2.5-flash",
  MAX_TOKENS: 2048,
} as const;

export const ERROR_MESSAGES = {
  QUERY_REQUIRED: "'query' field is required and must be a non-empty string.",
  INVALID_TOP_K: "'top_k' must be between 1 and 20.",
  EMBEDDING_SERVICE_UNAVAILABLE: "Embedding service unavailable. Please try again later.",
  NO_RESULTS: "No relevant code was found in the repository for your query.",
} as const;
