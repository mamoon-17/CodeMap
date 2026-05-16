import "reflect-metadata";
import app from "./app";
import { config } from "./config/config";
import { AppDataSource } from "./config/datasource";

const configResult = config.init();
if (configResult.isErr()) {
  console.error(
    "Missing environment variables:",
    configResult.error.join(", "),
  );
  process.exit(1);
}

const initializeDataSource = async () => {
  try {
    await AppDataSource.initialize();
    console.log("Database connection initialized successfully");
  } catch (e) {
    console.error("Error during DataSource initialization:", e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Failed to initialize DataSource: ${errorMessage}`);
    process.exit(1);
  }
};

// ── Keep-alive: prevent Supabase free-tier DB from going inactive ──────────
// Runs a lightweight query every 5 minutes.
function startDbKeepAlive() {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  setInterval(async () => {
    try {
      await AppDataSource.query("SELECT 1");
    } catch (e) {
      console.warn(
        "[db-keepalive] Ping failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }, INTERVAL_MS);
  console.log("[db-keepalive] Scheduled every 5 minutes");
}

// ── Keep-alive: self-ping to prevent Render cold starts ────────────────────
// Pings own /health every 10 minutes.
function startSelfPing(port: number) {
  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  const ragUrl = config.getEmbeddingServiceUrl();

  setInterval(async () => {
    // Ping self
    try {
      await fetch(`http://localhost:${port}/health`);
    } catch {
      // Self-ping failure is non-fatal; Render will keep the service alive via
      // external health checks if configured.
    }

    // Also ping the RAG service to keep it warm
    if (ragUrl) {
      try {
        await fetch(`${ragUrl}/health`);
      } catch {
        // RAG ping failure is non-fatal
      }
    }
  }, INTERVAL_MS);
  console.log(
    `[keepalive] Self-ping scheduled every 10 min (also pinging RAG at ${ragUrl})`,
  );
}

initializeDataSource().then(() => {
  console.log("Database connected successfully");
  const PORT = config.getPort();
  app.listen(PORT, () => {
    console.log(`Server active at: http://localhost:${PORT}`);
    startDbKeepAlive();
    startSelfPing(PORT!);
  });
});
