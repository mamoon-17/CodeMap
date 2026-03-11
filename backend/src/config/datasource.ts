import { DataSource } from "typeorm";
import { User } from "../modules/user/user.entity";
import { Project } from "../modules/project/project.entity";
import { config } from "./config";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.SUPABASE_URI || config.getSupabaseUri(),
  ssl: {
    rejectUnauthorized: false,
  },
  entities: [User, Project],
  synchronize: true,
  dropSchema: false,
  logging: false,
});
