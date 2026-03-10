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

initializeDataSource().then(() => {
  const PORT = config.getPort();
  app.listen(PORT, () => {
    console.log(`Server active at: http://localhost:${PORT}`);
  });
});
