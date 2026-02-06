import "reflect-metadata";
import app from "./app";
import { config } from "./config/config";
import { appDataSource } from "./config/datasource";
import { ok, err, Result } from "neverthrow";

const configResult = config.init();
if (configResult.isErr()) {
  console.error(
    "Missing environment variables:",
    configResult.error.join(", "),
  );
  process.exit(1);
}

const initializeDataSource = async (): Promise<Result<void, string>> => {
  const dataSourceResult = appDataSource.getInstance();

  if (dataSourceResult.isErr()) {
    return err(dataSourceResult.error);
  }

  try {
    await dataSourceResult.value.initialize();
    return ok(undefined);
  } catch (e) {
    console.error("Error during DataSource initialization:", e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    return err(`Failed to initialize DataSource: ${errorMessage}`);
  }
};

initializeDataSource().then((result) => {
  result.match(
    () => {
      const PORT = config.getPort();
      app.listen(PORT, () => {
        console.log(`Server active at: http://localhost:${PORT}`);
      });
    },
    (error) => {
      console.error("Error during DataSource initialization:", error);
      process.exit(1);
    },
  );
});
