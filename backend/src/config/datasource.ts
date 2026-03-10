import { DataSource } from "typeorm";
import { User } from "../modules/user/user.entity";
import { config } from "./config";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.SUPABASE_URI || config.getSupabaseUri(),
  ssl: {
    rejectUnauthorized: false,
  },
  entities: [User],
  synchronize: true,
  dropSchema: true, // TEMPORARY: Will drop and recreate schema on startup
  logging: false,
});

