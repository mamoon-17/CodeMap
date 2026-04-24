import type {
  IngestRequest,
  IngestResponse,
  QueryRequest,
  QueryResponse,
} from "@/types/api";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export async function queryCodebase(
  request: QueryRequest,
): Promise<QueryResponse> {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      error.error || `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

export async function ingestCodebase(
  request: IngestRequest,
): Promise<IngestResponse> {
  const response = await fetch(`${API_BASE_URL}/query/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Unknown error" }));
    const baseMessage =
      error.detail ||
      error.error ||
      `HTTP ${response.status}: ${response.statusText}`;
    const details = error.details ? ` — ${error.details}` : "";
    throw new Error(`${baseMessage}${details}`);
  }

  return response.json();
}
