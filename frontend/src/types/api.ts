export interface QueryRequest {
  query: string;
  top_k?: number;
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
