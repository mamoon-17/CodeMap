import { Result, ok, err } from "neverthrow";
import { QUERY_CONSTRAINTS, ERROR_MESSAGES } from "../constants";

export class QueryValidator {
  static validateQueryRequest(
    projectId: string | undefined,
    query: string | undefined,
    topK: number | undefined,
  ): Result<{ projectId: string; query: string; topK: number }, string> {
    if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
      return err("project_id is required");
    }

    // Validate query
    if (!query || typeof query !== "string" || !query.trim()) {
      return err(ERROR_MESSAGES.QUERY_REQUIRED);
    }

    // Validate and normalize top_k
    const normalizedTopK =
      typeof topK === "number" ? topK : QUERY_CONSTRAINTS.DEFAULT_TOP_K;

    if (
      normalizedTopK < QUERY_CONSTRAINTS.MIN_TOP_K ||
      normalizedTopK > QUERY_CONSTRAINTS.MAX_TOP_K
    ) {
      return err(ERROR_MESSAGES.INVALID_TOP_K);
    }

    return ok({
      projectId: projectId.trim(),
      query: query.trim(),
      topK: normalizedTopK,
    });
  }
}
