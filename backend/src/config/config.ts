import dotenv from "dotenv";
import { ok, err, Result } from "neverthrow";

dotenv.config();

export class Config {
  private SUPABASE_URI?: string;
  private PORT?: number;
  private GEMINI_API_KEY?: string;
  private EMBEDDING_SERVICE_URL?: string;
  private initialized = false;

  constructor() {
    this.SUPABASE_URI = process.env.SUPABASE_URI;
    const port = process.env.PORT;
    this.PORT = port ? parseInt(port, 10) : undefined;
    this.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    this.EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || "http://localhost:5001";
  }

  init(): Result<string, string[]> {
    const missing: string[] = [];

    if (!this.SUPABASE_URI) missing.push("SUPABASE_URI");
    if (!this.PORT) missing.push("PORT");
    if (!this.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");

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
    return this.GEMINI_API_KEY;
  }

  getEmbeddingServiceUrl() {
    return this.EMBEDDING_SERVICE_URL;
  }
}

export const config = new Config();
