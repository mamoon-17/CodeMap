import { Request, Response, NextFunction } from "express";
import { queryService, IngestRequest } from "./query.service";
import { AgenticQueryRequest, SnippetAnalysisRequest } from "./types";
import { QueryValidator } from "./utils";
import { ERROR_MESSAGES } from "./constants";
import { AppDataSource } from "../../config/datasource";
import { RepositoryRecord } from "../project/repository.entity";

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
    const { project_id, query, top_k } = req.body as AgenticQueryRequest;

    // Validate request
    const validationResult = QueryValidator.validateQueryRequest(
      project_id,
      query,
      top_k,
    );
    if (validationResult.isErr()) {
      return res.status(400).json({ error: validationResult.error });
    }

    const { projectId, query: validatedQuery, topK } = validationResult.value;

    // Execute agentic query
    const result = await queryService.agenticQuery(
      projectId,
      validatedQuery,
      topK,
    );

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
      },
    );
  };

  ingestCodebase = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await queryService.ingestCodebase(req.body);

      return result.match(
        async (ingestResult) => {
          const projectId = String(req.body?.project_id || "").trim();
          const ghMatch = projectId.match(/^gh_(\d+)$/);

          // If this ingest corresponds to a GitHub repo, persist "last indexed"
          // so the Dashboard can compare vs GitHub `updated_at`.
          if (ghMatch) {
            const githubRepoId = ghMatch[1];
            try {
              const repo = AppDataSource.getRepository(RepositoryRecord);
              const updateResult = await repo.update(
                { githubRepoId },
                { lastIndexedAt: new Date(), needsReindex: false },
              );
              if (updateResult.affected === 0) {
                console.warn(
                  `[ingest] No RepositoryRecord found for githubRepoId=${githubRepoId} (project_id=${projectId})`,
                );
              }
            } catch {
              // Avoid failing ingest if sync-state update fails.
              console.warn(
                `[ingest] Failed updating sync state for project_id=${projectId}`,
              );
            }
          }

          return res.status(200).json(ingestResult);
        },
        (error) => {
          if (error.includes("Python RAG service error")) {
            return res.status(502).json({
              error: "Embedding service unavailable. Please try again later.",
              details: error,
            });
          }

          return next(new Error(error));
        },
      );
    } catch (error) {
      return next(error);
    }
  /**
   * POST /query/analyze-snippet
   *
   * Body: { "file_path": "src/foo.ts", "code": "..." }
   *
   * Response:
   * {
   *   "file_path": "...",
   *   "summary": "...",
   *   "explanation": "..."
   * }
   */
  analyzeSnippet = async (req: Request, res: Response, next: NextFunction) => {
    const { file_path, code } = req.body as SnippetAnalysisRequest;

    if (!file_path || typeof file_path !== "string" || !file_path.trim()) {
      return res.status(400).json({ error: "file_path is required" });
    }
    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "code is required" });
    }

    const result = await queryService.analyzeSnippet(file_path, code);

    return result.match(
      (analysis) => res.status(200).json(analysis),
      (error) => {
        if (error.startsWith("Python RAG service error 429:")) {
          return res.status(429).json({
            error: "Rate limit exceeded. Please wait and try again.",
          });
        }
        if (error.includes("Python RAG service error")) {
          return res.status(502).json({
            error: ERROR_MESSAGES.EMBEDDING_SERVICE_UNAVAILABLE,
          });
        }
        return next(new Error(error));
      },
    );
  };

  /**
   * POST /query/ingest
   * Forwards ingest request to Python RAG service
   *
   * Body: { "project_id": "...", "files": [{ "file_path": "...", "content": "..." }] }
   */
  ingestFiles = async (req: Request, res: Response, next: NextFunction) => {
    const { project_id, files, replace_project } = req.body as IngestRequest;

    if (!project_id || typeof project_id !== "string" || !project_id.trim()) {
      return res.status(400).json({ error: "project_id is required" });
    }
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "files array is required and must not be empty" });
    }

    const result = await queryService.ingestFiles({
      project_id,
      files,
      replace_project,
    });

    return result.match(
      (ingestResult) => res.status(200).json(ingestResult),
      (error) => {
        console.error("[ingestFiles] error from RAG service:", error);
        if (error.includes("Python RAG service error")) {
          return res.status(502).json({
            error: ERROR_MESSAGES.EMBEDDING_SERVICE_UNAVAILABLE,
            details: error,
          });
        }
        return next(new Error(error));
      },
    );
  };
}

export const queryController = new QueryController();
