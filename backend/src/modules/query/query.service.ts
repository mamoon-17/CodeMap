import { Result, ok, err } from "neverthrow";
import { AgenticQueryResult } from "./types";
import { config } from "../../config/config";

class QueryService {
  private ragServiceUrl: string;

  constructor() {
    // Python RAG service URL (previously embedding service URL)
    this.ragServiceUrl =
      config.getEmbeddingServiceUrl() || "http://localhost:5001";
  }

  /**
   * Main query method - Forwards to Python RAG service
   * Python service handles: LLM logic, tool calling, and embedding retrieval
   */
  async agenticQuery(
    projectId: string,
    queryText: string,
    topK: number = 5,
  ): Promise<Result<AgenticQueryResult, string>> {
    try {
      // Forward request to Python RAG service with timeout protection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(`${this.ragServiceUrl}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          query: queryText,
          top_k: topK,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text();
        return err(`Python RAG service error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        query: string;
        answer: string;
        tool_used: boolean;
        sources?: Array<{
          file: string;
          chunk_index: number;
          score: number;
          text: string;
        }>;
      };

      // Map Python response to TypeScript types
      return ok({
        query: data.query,
        answer: data.answer,
        tool_used: data.tool_used,
        sources: data.sources || undefined,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return err("Python RAG service request timed out after 10 seconds");
      }
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to query Python RAG service: ${message}`);
    }
  }
}

export const queryService = new QueryService();
