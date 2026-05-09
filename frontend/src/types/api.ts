export interface QueryRequest {
  project_id: string;
  query: string;
  top_k?: number;
}

export interface IngestFileInput {
  file_path: string;
  content: string;
}

export interface IngestRequest {
  project_id: string;
  files: IngestFileInput[];
  replace_project?: boolean;
}

export interface IngestResponse {
  indexed: number;
}

export interface ProjectFilesResponse {
  project_id: string;
  files: string[];
}

export interface ProjectFileContentResponse {
  project_id: string;
  file_path: string;
  content: string;
  chunks: Array<{
    start_line: number;
    end_line: number;
    text: string;
  }>;
}

export interface ReindexStartRequest {
  repo_id?: string;
  project_id?: string;
}

export interface ReindexStartResponse {
  success: boolean;
  data?: {
    job_id: string;
    status: "started" | "completed" | "failed";
    project_id: string;
    repo_id: string;
  };
  error?: string;
}

export interface ReindexStatusResponse {
  success: boolean;
  data?: {
    job_id: string;
    status: "started" | "completed" | "failed";
    project_id: string;
    repo_id: string;
    indexed_chunks: number;
    skipped_files_count?: number;
    skipped_files?: Array<{ file: string; reason: string }> | null;
    last_step?: string;
    logs?: Array<{ ts: string; level: "info" | "warn" | "error"; message: string }> | null;
    error: string | null;
    stack_trace?: string | null;
    updated_at: string;
    created_at: string;
  };
  error?: string;
}

export interface Source {
  file: string;
  chunk_index: number;
  score: number;
  text: string;
}

export interface QueryResponse {
  query: string;
  answer: string;
  tool_used: boolean;
  sources?: Source[];
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  authProvider: "local" | "google" | "github" | "guest";
  avatarUrl: string | null;
  isGuest: boolean;
  githubConnected: boolean;
  googleConnected: boolean;
}

export interface ProjectContextItem {
  id: string;
  name: string;
  source: "github" | "upload";
}
