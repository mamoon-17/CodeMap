import dotenv from "dotenv";
import { ok, err, Result } from "neverthrow";

dotenv.config();

export class Config {
  private SUPABASE_URI?: string;
  private PORT?: number;
  private RAG_SERVICE_URL?: string;
  private JWT_ACCESS_SECRET?: string;
  private JWT_REFRESH_SECRET?: string;
  private initialized = false;

  constructor() {
    this.SUPABASE_URI = process.env.SUPABASE_URI;
    const port = process.env.PORT;
    this.PORT = port ? parseInt(port, 10) : undefined;
    // Python RAG service URL (replaces GEMINI_API_KEY and EMBEDDING_SERVICE_URL)
    this.RAG_SERVICE_URL =
      process.env.RAG_SERVICE_URL ||
      process.env.EMBEDDING_SERVICE_URL ||
      "http://localhost:5001";
    this.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    this.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  }

  init(): Result<string, string[]> {
    const missing: string[] = [];

    if (!this.SUPABASE_URI) missing.push("SUPABASE_URI");
    if (!this.PORT) missing.push("PORT");
    // Note: GEMINI_API_KEY is now only needed in Python service

    if (missing.length > 0) return err(missing);

    this.initialized = true;
    return ok("Environment variables loaded successfully");
  }

  isInitialized() {
    return this.initialized;
  }

  getSupabaseUri() {
    return this.SUPABASE_URI;
  }

  getPort() {
    return this.PORT;
  }

  getGeminiApiKey() {
    // Kept for backward compatibility, but no longer used
    // API key is now in Python service
    return undefined;
  }

  getEmbeddingServiceUrl() {
    // Now returns Python RAG service URL
    return this.RAG_SERVICE_URL;
  }

  getJwtAccessSecret() {
    return this.JWT_ACCESS_SECRET;
  }

  getJwtRefreshSecret() {
    return this.JWT_REFRESH_SECRET;
  }
}

export const config = new Config();
