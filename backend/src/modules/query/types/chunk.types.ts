export interface ChunkMetadata {
  file: string;
  chunk_index: number;
  text: string;
}

export interface Chunk {
  id: string;
  score: number;
  metadata: ChunkMetadata;
}

export interface EmbeddingServiceResponse {
  results: Chunk[];
}
