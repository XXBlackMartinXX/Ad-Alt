import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Singleton connection pool — one instance shared across the process lifetime.
const sql = postgres(connectionString, {
  max: parseInt(process.env["DATABASE_POOL_MAX"] ?? "10"),
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });
export type DB = typeof db;
export { sql as pgClient };
