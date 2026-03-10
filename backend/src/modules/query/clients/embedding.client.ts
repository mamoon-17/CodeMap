import { Result, ok, err } from "neverthrow";
import { config } from "../../../config/config";
import { Chunk, EmbeddingServiceResponse } from "../types";

export class EmbeddingClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.getEmbeddingServiceUrl() || "http://localhost:5001";
  }

  /**
   * Retrieves relevant code chunks from the Python embedding service
   */
  async retrieveChunks(
    queryText: string,
    topK: number
  ): Promise<Result<Chunk[], string>> {
    try {
      const response = await fetch(`${this.baseUrl}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, top_k: topK }),
      });

      if (!response.ok) {
        const body = await response.text();
        return err(
          `Embedding service error ${response.status}: ${body}`
        );
      }

      const data = (await response.json()) as EmbeddingServiceResponse;
      return ok(data.results);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to retrieve chunks: ${message}`);
    }
  }
}

export const embeddingClient = new EmbeddingClient();
