import { Result, ok, err } from "neverthrow";
import { AgenticQueryResult } from "./types";
import { ERROR_MESSAGES } from "./constants";
import { embeddingClient, llmClient } from "./clients";

class QueryService {
  /**
   * Main query method - LLM decides whether to search the codebase
   */
  async agenticQuery(
    queryText: string,
    topK: number = 5
  ): Promise<Result<AgenticQueryResult, string>> {
    // Step 1: First LLM call with tool definition
    const firstCallResult = await llmClient.generateWithTools(queryText);
    if (firstCallResult.isErr()) {
      return err(firstCallResult.error);
    }

    const firstResponse = firstCallResult.value;

    // Case 1: LLM answered directly without calling the tool
    if (firstResponse.type === "answer") {
      return ok({
        query: queryText,
        answer: firstResponse.text,
        tool_used: false,
      });
    }

    // Case 2: LLM called the retrieve_code_chunks tool
    if (firstResponse.type === "tool_call") {
      const toolCall = firstResponse.call;

      // Validate tool call
      if (toolCall.name !== "retrieve_code_chunks") {
        return err(`Unknown tool called: ${toolCall.name}`);
      }

      const searchQuery = toolCall.args.query as string;
      if (!searchQuery) {
        return err("Tool call missing 'query' argument");
      }

      // Execute the retrieval
      const chunksResult = await embeddingClient.retrieveChunks(
        searchQuery,
        topK
      );
      if (chunksResult.isErr()) {
        return err(chunksResult.error);
      }

      const chunks = chunksResult.value;

      // Handle no chunks found
      if (!chunks || chunks.length === 0) {
        return ok({
          query: queryText,
          answer: ERROR_MESSAGES.NO_RESULTS,
          tool_used: true,
          sources: [],
        });
      }

      // Step 2: Second LLM call with retrieved chunks
      const secondCallResult = await llmClient.generateWithToolResult(
        queryText,
        chunks
      );
      if (secondCallResult.isErr()) {
        return err(secondCallResult.error);
      }

      // Step 3: Return final answer with sources
      return ok({
        query: queryText,
        answer: secondCallResult.value,
        tool_used: true,
        sources: chunks.map((c) => ({
          file: c.metadata.file,
          chunk_index: c.metadata.chunk_index,
          score: c.score,
          text: c.metadata.text,
        })),
      });
    }

    // Should never reach here
    return err("Unexpected response type from LLM");
  }
}

export const queryService = new QueryService();
