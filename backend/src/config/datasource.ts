import { DataSource } from "typeorm";
import { User } from "../modules/user/user.entity";
import { Project } from "../modules/project/project.entity";
import { RepositoryRecord } from "../modules/project/repository.entity";
import { PublicRepoLink } from "../modules/project/public-repo-link.entity";
import { ReindexJob } from "../modules/reindex/reindex.entity";
import { config } from "./config";
import { err, ok, Result } from "neverthrow";

const ssl =
  process.env.DB_SSL === "false"
    ? false
    : {
        rejectUnauthorized: false,
      };

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.SUPABASE_URI || config.getSupabaseUri(),
  ssl,
  entities: [User, Project, RepositoryRecord, PublicRepoLink, ReindexJob],
  synchronize: true,
  dropSchema: false,
  logging: false,
});

// Backwards-compatible helper for any older callsites.
export const appDataSource = {
  getInstance(): Result<DataSource, string> {
    if (!config.isInitialized()) {
      return err(
        "Config not initialized. Call config.init() before using AppDataSource",
      );
    }
    return ok(AppDataSource);
  },
};
