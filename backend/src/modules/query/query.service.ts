import { Result, ok, err } from "neverthrow";
import { QueryResult } from "./types";
import { ERROR_MESSAGES } from "./constants";
import { embeddingClient, llmClient } from "./clients";

class QueryService {
  /**
   * Main query method that orchestrates the entire RAG pipeline
   */
  async query(
    queryText: string,
    topK: number = 5
  ): Promise<Result<QueryResult, string>> {
    // Step 1: Retrieve relevant chunks from embedding service
    const chunksResult = await embeddingClient.retrieveChunks(queryText, topK);
    if (chunksResult.isErr()) {
      return err(chunksResult.error);
    }

    const chunks = chunksResult.value;

    // Handle case where no chunks are found
    if (!chunks || chunks.length === 0) {
      return ok({
        query: queryText,
        answer: ERROR_MESSAGES.NO_RESULTS,
        sources: [],
      });
    }

    // Step 2: Generate answer using LLM
    const answerResult = await llmClient.generateAnswer(queryText, chunks);
    if (answerResult.isErr()) {
      return err(answerResult.error);
    }

    // Step 3: Format and return the response
    return ok({
      query: queryText,
      answer: answerResult.value,
      sources: chunks.map((c) => ({
        file: c.metadata.file,
        chunk_index: c.metadata.chunk_index,
        score: c.score,
        text: c.metadata.text,
      })),
    });
  }
}

export const queryService = new QueryService();
