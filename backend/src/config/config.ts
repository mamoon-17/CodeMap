import dotenv from "dotenv";
import { ok, err, Result } from "neverthrow";

dotenv.config();

export class Config {
  private SUPABASE_URI?: string;
  private PORT?: number;
  private JWT_ACCESS_SECRET?: string;
  private JWT_REFRESH_SECRET?: string;
  private GOOGLE_CLIENT_ID?: string;
  private GOOGLE_CLIENT_SECRET?: string;
  private GITHUB_CLIENT_ID?: string;
  private GITHUB_CLIENT_SECRET?: string;
  private initialized = false;

  constructor() {
    this.SUPABASE_URI = process.env.SUPABASE_URI;
    const port = process.env.PORT;
    this.PORT = port ? parseInt(port, 10) : undefined;
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
    if (!this.PORT) missing.push("PORT");
    if (!this.JWT_ACCESS_SECRET) missing.push("JWT_ACCESS_SECRET");
    if (!this.JWT_REFRESH_SECRET) missing.push("JWT_REFRESH_SECRET");

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

  getJwtAccessSecret(): string {
    if (!this.JWT_ACCESS_SECRET) {
      throw new Error("JWT_ACCESS_SECRET is not configured");
    }
    return this.JWT_ACCESS_SECRET;
  }

  getJwtRefreshSecret(): string {
    if (!this.JWT_REFRESH_SECRET) {
      throw new Error("JWT_REFRESH_SECRET is not configured");
    }
    return this.JWT_REFRESH_SECRET;
  }

  getGoogleClientId(): string {
    if (!this.GOOGLE_CLIENT_ID) {
      throw new Error("GOOGLE_CLIENT_ID is not configured");
    }
    return this.GOOGLE_CLIENT_ID;
  }

  getGoogleClientSecret(): string {
    if (!this.GOOGLE_CLIENT_SECRET) {
      throw new Error("GOOGLE_CLIENT_SECRET is not configured");
    }
    return this.GOOGLE_CLIENT_SECRET;
  }

  getGithubClientId(): string {
    if (!this.GITHUB_CLIENT_ID) {
      throw new Error("GITHUB_CLIENT_ID is not configured");
    }
    return this.GITHUB_CLIENT_ID;
  }

  getGithubClientSecret(): string {
    if (!this.GITHUB_CLIENT_SECRET) {
      throw new Error("GITHUB_CLIENT_SECRET is not configured");
    }
    return this.GITHUB_CLIENT_SECRET;
  }
}

export const config = new Config();
