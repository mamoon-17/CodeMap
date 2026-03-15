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
