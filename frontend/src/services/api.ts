import type {
  ProjectFileContentResponse,
  ProjectFilesResponse,
  QueryRequest,
  QueryResponse,
  ReindexStartRequest,
  ReindexStartResponse,
  ReindexStatusResponse,
} from "@/types/api";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Send a query to the RAG pipeline.
 * project_id is an internal identifier — never render it directly in UI.
 * Use project name from state for all display purposes.
 */
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

export async function getProjectFiles(
  projectId: string,
): Promise<ProjectFilesResponse> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/files`,
  );

  const payload = await response
    .json()
    .catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));

  if (!response.ok) {
    throw new ApiError(
      payload.error || `HTTP ${response.status}: ${response.statusText}`,
      response.status,
    );
  }

  return payload as ProjectFilesResponse;
}

export async function getProjectFileContent(
  projectId: string,
  filePath: string,
): Promise<ProjectFileContentResponse> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(filePath)}`,
  );

  const payload = await response
    .json()
    .catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return payload as ProjectFileContentResponse;
}

export async function startReindex(
  token: string,
  request: ReindexStartRequest,
): Promise<ReindexStartResponse> {
  const response = await fetch(`${API_BASE_URL}/reindex`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  const payload = await response
    .json()
    .catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return payload as ReindexStartResponse;
}

export async function getReindexStatus(
  token: string,
  jobId: string,
): Promise<ReindexStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/reindex/${jobId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response
    .json()
    .catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return payload as ReindexStatusResponse;
}

export async function retryProjectIndex(projectId: string): Promise<{
  project: { id: string; name: string; status: string };
  indexed: number;
  fileCount: number;
}> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/retry`, {
    method: "POST",
  });

  const payload = await response
    .json()
    .catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return payload as {
    project: { id: string; name: string; status: string };
    indexed: number;
    fileCount: number;
  };
}
