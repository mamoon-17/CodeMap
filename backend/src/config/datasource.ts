import { DataSource } from "typeorm";
import { Result, ok, err } from "neverthrow";
import { config } from "./config";

class AppDataSource {
  private dataSource?: DataSource;

  getInstance(): Result<DataSource, string> {
    if (!config.isInitialized()) {
      return err(
        "Config not initialized. Call config.init() before using AppDataSource",
      );
    }

    if (!this.dataSource) {
      this.dataSource = new DataSource({
        type: "postgres",
        url: config.getSupabaseUri(),
        ssl: {
          rejectUnauthorized: false,
        },
        entities: [__dirname + "/entity/*{.js,.ts}"],
        synchronize: true,
      });
    }
    return ok(this.dataSource);
  }
}

export const appDataSource = new AppDataSource();
