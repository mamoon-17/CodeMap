/**
 * Types for LLM function/tool calling
 */

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}

export interface AgenticQueryRequest {
  project_id: string;
  query: string;
  top_k?: number;
}

export interface AgenticQueryResult {
  query: string;
  answer: string;
  tool_used: boolean;
  sources?: Array<{
    file: string;
    chunk_index: number;
    score: number;
    text: string;
  }>;
}
