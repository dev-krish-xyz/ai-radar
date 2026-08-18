import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let queryClient: Sql | null = null;
let _db: Database | null = null;

function createDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL env var is required");
  }
  /** Vercel/serverless: one connection, no prepared statements (Neon-friendly). */
  const serverless = process.env.VERCEL === "1" || process.env.DB_SERVERLESS === "1";
  queryClient = postgres(
    connectionString,
    serverless ? { max: 1, idle_timeout: 20, connect_timeout: 10, prepare: false } : {},
  );
  return drizzle(queryClient, { schema });
}

/** Lazy so `next build` on Vercel can import this module before env is required at runtime. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    if (!_db) _db = createDb();
    return Reflect.get(_db, prop, receiver);
  },
});
