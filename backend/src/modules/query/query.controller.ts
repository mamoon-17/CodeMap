import { Request, Response, NextFunction } from "express";
import { queryService } from "./query.service";
import { AgenticQueryRequest } from "./types";
import { QueryValidator } from "./utils";
import { ERROR_MESSAGES } from "./constants";

class QueryController {
  /**
   * POST /query
   * Agentic endpoint - LLM decides whether to search the codebase
   * 
   * Body: { "query": "How does authentication work?", "top_k": 5 }
   *
   * Response:
   * {
   *   "query": "...",
   *   "answer": "...",
   *   "tool_used": true|false,
   *   "sources": [...] (only if tool was used)
   * }
   */
  agenticQuery = async (req: Request, res: Response, next: NextFunction) => {
    const { query, top_k } = req.body as AgenticQueryRequest;

    // Validate request
    const validationResult = QueryValidator.validateQueryRequest(query, top_k);
    if (validationResult.isErr()) {
      return res.status(400).json({ error: validationResult.error });
    }

    const { query: validatedQuery, topK } = validationResult.value;

    // Execute agentic query
    const result = await queryService.agenticQuery(validatedQuery, topK);

    return result.match(
      (queryResult) => res.status(200).json(queryResult),
      (error) => {
        // Rate limit errors
        if (error.startsWith("RATE_LIMIT:")) {
          const cleanError = error.replace("RATE_LIMIT: ", "");
          return res.status(429).json({
            error: "Rate limit exceeded. Please wait and try again.",
            details: cleanError,
          });
        }
        // Embedding service errors
        if (error.includes("Embedding service error")) {
          return res.status(502).json({
            error: ERROR_MESSAGES.EMBEDDING_SERVICE_UNAVAILABLE,
          });
        }
        return next(new Error(error));
      }
    );
  };
}

export const queryController = new QueryController();
