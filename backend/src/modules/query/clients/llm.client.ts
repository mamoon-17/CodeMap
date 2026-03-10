import { Result, ok, err } from "neverthrow";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../config/config";
import { LLM_CONFIG } from "../constants";
import { Chunk } from "../types";

export class LlmClient {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = config.getGeminiApiKey();
    this.genAI = new GoogleGenerativeAI(apiKey || "");
  }

  /**
   * Generates an answer using the LLM based on retrieved chunks
   */
  async generateAnswer(
    query: string,
    chunks: Chunk[]
  ): Promise<Result<string, string>> {
    try {
      const contextBlock = this.buildContextBlock(chunks);
      const prompt = this.buildPrompt(query, contextBlock);

      const model = this.genAI.getGenerativeModel({ model: LLM_CONFIG.MODEL });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (!text) {
        return err("No text content in LLM response");
      }

      return ok(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to generate answer: ${message}`);
    }
  }

  /**
   * Builds the context block from chunks
   */
  private buildContextBlock(chunks: Chunk[]): string {
    return chunks
      .map(
        (chunk, i) =>
          `### Chunk ${i + 1} — ${chunk.metadata.file} (similarity: ${chunk.score.toFixed(3)})\n\`\`\`\n${chunk.metadata.text}\n\`\`\``
      )
      .join("\n\n");
  }

  /**
   * Builds the complete prompt for the LLM
   */
  private buildPrompt(query: string, contextBlock: string): string {
    return `You are CodeMap, an intelligent codebase assistant.
You are given a developer's question and a set of relevant source code chunks retrieved from their repository.
Your job is to:
1. Directly answer the question based on the provided code.
2. Reference specific files and functions by name.
3. Provide detailed explanations and analysis to help developers understand the code.
4. If the chunks are insufficient to answer confidently, say so clearly.
Do NOT invent code that isn't in the provided chunks.

Developer question: "${query}"

Retrieved code chunks:
${contextBlock}

Please answer the developer's question based on the code above with detailed explanation and analysis.`;
  }
}

export const llmClient = new LlmClient();
