import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getEnv } from "../env";
import * as schema from "./schema";

let _sql: postgres.Sql | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Lazily-initialized Postgres connection + Drizzle instance. Lazy so that
 * importing this module doesn't itself throw before env validation has a
 * chance to produce a clear configuration error.
 */
export function getDb() {
  if (_db) return _db;
  const env = getEnv();
  _sql = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {
      /* silence routine NOTICE spam */
    },
  });
  _db = drizzle(_sql, { schema });
  return _db;
}

export async function checkDatabaseConnection(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const env = getEnv();
    const sql = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 5 });
    try {
      await sql`select 1`;
      return { ok: true };
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown database error" };
  }
}

export type Database = ReturnType<typeof getDb>;
