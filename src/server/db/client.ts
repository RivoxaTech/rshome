import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "@/server/env";
import * as schema from "./schema";

declare global {
  var __dbPool: mysql.Pool | undefined;
}

// One pool per process. Kept on globalThis so Next.js dev's hot reload
// (which re-runs this module) doesn't leak a new pool on every edit.
export const pool =
  globalThis.__dbPool ??
  mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: 4,
    idleTimeout: 60_000,
    timezone: "Z",
    charset: "utf8mb4_unicode_ci",
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
