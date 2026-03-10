import { Result, ok, err } from "neverthrow";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { config } from "../../../config/config";
import { LLM_CONFIG } from "../constants";
import { Chunk, ToolCall } from "../types";

export class LlmClient {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = config.getGeminiApiKey();
    this.genAI = new GoogleGenerativeAI(apiKey || "");
  }

  /**
   * Check if error is a rate limit error (429)
   */
  private isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("429") ||
      message.includes("Too Many Requests") ||
      message.includes("quota") ||
      message.includes("Quota exceeded")
    );
  }

  /**
   * Agentic generation: LLM decides whether to call retrieve_code_chunks
   * Returns either a direct answer OR a tool call request
   */
  async generateWithTools(
    userQuery: string
  ): Promise<Result<{ type: "answer"; text: string } | { type: "tool_call"; call: ToolCall }, string>> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: LLM_CONFIG.MODEL,
        tools: [
          {
            functionDeclarations: [
              {
                name: "retrieve_code_chunks",
                description: "Search the codebase for relevant source code. Use this when the user asks about specific functionality, files, implementation details, or anything that requires looking at the actual repository code. Do NOT use for general programming questions.",
                parameters: {
                  type: SchemaType.OBJECT,
                  properties: {
                    query: {
                      type: SchemaType.STRING,
                      description: "The search query to find relevant code chunks",
                    },
                  },
                  required: ["query"],
                },
              },
            ],
          },
        ],
      });

      const chat = model.startChat({
        history: [],
      });

      const result = await chat.sendMessage(userQuery);
      const response = result.response;

      // Check if LLM called the function
      const functionCalls = response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        if (!call) {
          return err("Function call is undefined");
        }
        return ok({
          type: "tool_call",
          call: {
            name: call.name,
            args: call.args,
          },
        });
      }

      // Otherwise, return direct answer
      const text = response.text();
      if (!text) {
        return err("No text content in LLM response");
      }

      return ok({ type: "answer", text });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (this.isRateLimitError(e)) {
        console.error("⏸️  Rate limit exceeded:", message);
        return err(`RATE_LIMIT: ${message}`);
      }
      return err(`Failed to generate with tools: ${message}`);
    }
  }

  /**
   * Second LLM call after tool execution with retrieved chunks
   */
  async generateWithToolResult(
    userQuery: string,
    chunks: Chunk[]
  ): Promise<Result<string, string>> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: LLM_CONFIG.MODEL,
        tools: [
          {
            functionDeclarations: [
              {
                name: "retrieve_code_chunks",
                description: "Search the codebase for relevant source code.",
                parameters: {
                  type: SchemaType.OBJECT,
                  properties: {
                    query: {
                      type: SchemaType.STRING,
                      description: "The search query",
                    },
                  },
                  required: ["query"],
                },
              },
            ],
          },
        ],
      });

      const chat = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: userQuery }],
          },
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "retrieve_code_chunks",
                  args: { query: userQuery },
                },
              },
            ],
          },
        ],
      });

      // Send function response
      const functionResponse = {
        name: "retrieve_code_chunks",
        response: {
          chunks: chunks.map((c) => ({
            file: c.metadata.file,
            text: c.metadata.text,
            score: c.score,
          })),
        },
      };

      const result = await chat.sendMessage([
        { functionResponse: functionResponse },
      ]);
      const response = result.response;
      const text = response.text();

      if (!text) {
        return err("No text content in LLM response");
      }

      return ok(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (this.isRateLimitError(e)) {
        console.error("⏸️  Rate limit exceeded:", message);
        return err(`RATE_LIMIT: ${message}`);
      }
      return err(`Failed to generate with tool result: ${message}`);
    }
  }
}

export const llmClient = new LlmClient();
