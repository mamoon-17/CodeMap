import { Result, ok, err } from "neverthrow";
import { AgenticQueryResult, SnippetAnalysisResult } from "./types";
import { config } from "../../config/config";

export interface IngestRequest {
  project_id: string;
  files: Array<{ file_path: string; content: string }>;
  replace_project?: boolean;
}

export interface IngestResult {
  indexed: number;
}

export interface DeleteVectorsResult {
  deleted: boolean;
}

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

  async ingestCodebase(
    request: IngestRequest,
  ): Promise<Result<IngestResult, string>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(`${this.ragServiceUrl}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text();
        return err(`Python RAG service error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as IngestResult;
      if (!data || typeof data.indexed !== "number") {
        return err("Invalid response from Python RAG service (ingest)");
      }

      return ok(data);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return err("Python RAG service request timed out after 10 seconds");
      }
      const message = e instanceof Error ? e.message : String(e);
      return err(
        `Failed to ingest codebase via Python RAG service: ${message}`,
      );
    }
  }

  async analyzeSnippet(
    filePath: string,
    code: string,
  ): Promise<Result<SnippetAnalysisResult, string>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(`${this.ragServiceUrl}/analyze-snippet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: filePath, code }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text();
        return err(`Python RAG service error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as SnippetAnalysisResult;
      if (
        !data ||
        typeof data.file_path !== "string" ||
        typeof data.summary !== "string" ||
        typeof data.explanation !== "string"
      ) {
        return err("Invalid response from Python RAG service (analyze-snippet)");
      }

      return ok(data);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return err("Python RAG service request timed out after 10 seconds");
      }
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to analyze snippet via Python RAG service: ${message}`);
    }
  }

  async ingestFiles(
    request: IngestRequest,
  ): Promise<Result<IngestResult, string>> {
    try {
      console.log(
        `[ingestFiles] Forwarding to ${this.ragServiceUrl}/ingest (project_id=${request.project_id}, files=${request.files.length})`,
      );
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300_000);
      const response = await fetch(`${this.ragServiceUrl}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text();
        return err(`Python RAG service error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as IngestResult;
      if (!data || typeof data.indexed !== "number") {
        return err("Invalid response from Python RAG service (ingest)");
      }

      return ok(data);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return err("Python RAG service request timed out after 300 seconds");
      }
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to ingest files: ${message}`);
    }
  }

  async deleteProjectVectors(
    projectId: string,
  ): Promise<Result<DeleteVectorsResult, string>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      const response = await fetch(
        `${this.ragServiceUrl}/projects/${encodeURIComponent(projectId)}/vectors`,
        {
          method: "DELETE",
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text();
        return err(`Python RAG service error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as { deleted?: boolean };
      return ok({ deleted: Boolean(data?.deleted) });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return err("Python RAG service request timed out after 30 seconds");
      }
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to delete vectors via Python RAG service: ${message}`);
    }
  }
}

export const queryService = new QueryService();
