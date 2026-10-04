/**
 * The rate limiter's sweep (S22 BUG-17): rows whose window ended more than a day ago are removed
 * when any bucket starts a new window, so the table no longer grows with every IP ever seen.
 * Skips without TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rateLimits } from "@/server/db/schema/access-control";
import { assertTestDatabase, resetTables } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("consumeRateLimit sweep (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let consumeRateLimit: typeof import("./rate-limit").consumeRateLimit;

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ consumeRateLimit } = await import("./rate-limit"));
  });

  beforeEach(async () => {
    await resetTables(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("removes long-expired buckets when a window starts, and leaves recent ones alone", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(rateLimits).values([
      { bucket: "sweep:old", count: 3, windowEndsAt: twoDaysAgo },
      { bucket: "sweep:recent", count: 3, windowEndsAt: oneHourAgo },
    ]);

    expect(await consumeRateLimit("sweep:fresh", { max: 5, windowMs: 60_000 })).toEqual({ allowed: true });

    const buckets = (await db.select({ bucket: rateLimits.bucket }).from(rateLimits)).map((row) => row.bucket).sort();
    expect(buckets).toEqual(["sweep:fresh", "sweep:recent"]);

    // A plain increment (no new window) never sweeps: the recent row is still there afterwards.
    expect(await consumeRateLimit("sweep:fresh", { max: 5, windowMs: 60_000 })).toEqual({ allowed: true });
    expect((await db.select().from(rateLimits)).length).toBe(2);
  });

  it("still blocks the (max + 1)th attempt in a window", async () => {
    for (let i = 0; i < 2; i += 1) expect((await consumeRateLimit("sweep:limit", { max: 2, windowMs: 60_000 })).allowed).toBe(true);
    expect((await consumeRateLimit("sweep:limit", { max: 2, windowMs: 60_000 })).allowed).toBe(false);
  });
});
