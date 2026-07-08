import { Pool } from "pg";

// Single shared pool across hot-reloads in dev.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://orderdesk:orderdesk@localhost:54329/orderdesk",
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export async function query<T extends import("pg").QueryResultRow = never>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[] }> {
  return pool.query<T>(text, params as unknown[]);
}
