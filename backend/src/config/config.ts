import dotenv from "dotenv";
import path from "path";
import { ok, err, Result } from "neverthrow";

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
  override: true,
});

export class Config {
  private SUPABASE_URI?: string;
  private SUPABASE_URL?: string;
  private SUPABASE_SERVICE_ROLE_KEY?: string;
  private PORT?: number;
  private FRONTEND_URL?: string;
  private RAG_SERVICE_URL?: string;
  private JWT_ACCESS_SECRET?: string;
  private JWT_REFRESH_SECRET?: string;
  private GOOGLE_CLIENT_ID?: string;
  private GOOGLE_CLIENT_SECRET?: string;
  private GITHUB_CLIENT_ID?: string;
  private GITHUB_CLIENT_SECRET?: string;
  private initialized = false;

  constructor() {
    this.SUPABASE_URI = process.env.SUPABASE_URI;
    this.SUPABASE_URL = process.env.SUPABASE_URL;
    this.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const port = process.env.PORT;
    this.PORT = port ? parseInt(port, 10) : undefined;
    this.FRONTEND_URL = process.env.FRONTEND_URL;
    // Python RAG service URL (replaces GEMINI_API_KEY and EMBEDDING_SERVICE_URL)
    this.RAG_SERVICE_URL =
      process.env.RAG_SERVICE_URL ||
      process.env.EMBEDDING_SERVICE_URL ||
      "http://localhost:5001";
    this.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    this.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
    this.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    this.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    this.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
    this.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  }

  init(): Result<string, string[]> {
    const missing: string[] = [];

    if (!this.SUPABASE_URI) missing.push("SUPABASE_URI");
    if (!this.SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!this.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
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

  getSupabaseUrl() {
    return this.SUPABASE_URL;
  }

  getSupabaseServiceRoleKey() {
    return this.SUPABASE_SERVICE_ROLE_KEY;
  }

  getPort() {
    return this.PORT;
  }

  getFrontendUrl() {
    return this.FRONTEND_URL;
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

  getGoogleClientId() {
    return this.GOOGLE_CLIENT_ID;
  }

  getGoogleClientSecret() {
    return this.GOOGLE_CLIENT_SECRET;
  }

  getGithubClientId() {
    return this.GITHUB_CLIENT_ID;
  }

  getGithubClientSecret() {
    return this.GITHUB_CLIENT_SECRET;
  }
}

export const config = new Config();
