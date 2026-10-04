/** MySQL's "Duplicate entry" error number: a unique index refused the write. */
const DUPLICATE_ENTRY = 1062;

/**
 * Drizzle wraps driver errors (`DrizzleQueryError`, the mysql2 error on `.cause`), so checking
 * `errno` on the thrown object directly never matches (S22 BUG-09). This unwraps either shape.
 */
export function mysqlErrorOf(error: unknown): { errno?: number; sqlMessage?: string } | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = "cause" in error && typeof error.cause === "object" && error.cause !== null ? error.cause : error;
  return candidate as { errno?: number; sqlMessage?: string };
}

/** True when a unique index refused the write, whether or not Drizzle wrapped the driver error. */
export function isDuplicateEntry(error: unknown): boolean {
  return mysqlErrorOf(error)?.errno === DUPLICATE_ENTRY;
}
