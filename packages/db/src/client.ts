import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL env var is required");
}

/** Vercel/serverless: one connection, no prepared statements (Neon-friendly). */
const serverless = process.env.VERCEL === "1" || process.env.DB_SERVERLESS === "1";

const queryClient = postgres(connectionString, serverless
  ? { max: 1, idle_timeout: 20, connect_timeout: 10, prepare: false }
  : {},
);
export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
