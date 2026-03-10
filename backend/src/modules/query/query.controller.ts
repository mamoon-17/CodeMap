import { Request, Response, NextFunction } from "express";
import { queryService } from "./query.service";
import { QueryRequestDto } from "./types";
import { QueryValidator } from "./utils";
import { ERROR_MESSAGES } from "./constants";

class QueryController {
  /**
   * POST /query
   * Body: { "query": "Where is authentication handled?", "top_k": 5 }
   *
   * Response:
   * {
   *   "query": "...",
   *   "answer": "...",
   *   "sources": [...]
   * }
   */
  query = async (req: Request, res: Response, next: NextFunction) => {
    const { query, top_k } = req.body as QueryRequestDto;

    // Validate request
    const validationResult = QueryValidator.validateQueryRequest(query, top_k);
    if (validationResult.isErr()) {
      return res.status(400).json({ error: validationResult.error });
    }

    const { query: validatedQuery, topK } = validationResult.value;

    // Execute query
    const result = await queryService.query(validatedQuery, topK);

    return result.match(
      (queryResult) => res.status(200).json(queryResult),
      (error) => {
        // Distinguish between embedding service errors and internal errors
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
