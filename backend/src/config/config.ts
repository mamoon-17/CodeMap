import dotenv from "dotenv";
import { ok, err, Result } from "neverthrow";

dotenv.config();

export class Config {
  private SUPABASE_URI?: string;
  private PORT?: number;
  private initialized = false;

  constructor() {
    this.SUPABASE_URI = process.env.SUPABASE_URI;
    const port = process.env.PORT;
    this.PORT = port ? parseInt(port, 10) : undefined;
  }

  init(): Result<string, string[]> {
    const missing: string[] = [];

    if (!this.SUPABASE_URI) missing.push("SUPABASE_URI");
    if (!this.PORT) missing.push("PORT");

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
}

export const config = new Config();
