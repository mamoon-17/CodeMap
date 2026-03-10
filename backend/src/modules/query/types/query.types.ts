export interface QueryRequestDto {
  query: string;
  top_k?: number;
}

export interface SourceDto {
  file: string;
  chunk_index: number;
  score: number;
  text: string;
}

export interface QueryResult {
  query: string;
  answer: string;
  sources: SourceDto[];
}
