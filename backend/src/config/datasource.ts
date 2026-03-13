import { DataSource } from "typeorm";
import { Chunk } from "../modules/chunk/chunk.entity";
import { User } from "../modules/user/user.entity";
import { config } from "./config";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.SUPABASE_URI || config.getSupabaseUri(),
  ssl: {
    rejectUnauthorized: false,
  },
  entities: [User, Chunk],
  synchronize: true,
  dropSchema: false,
  logging: false,
});

