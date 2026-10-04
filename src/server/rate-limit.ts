import { eq, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rateLimits } from "@/server/db/schema/access-control";

export type RateLimitRow = { count: number; windowEndsAt: Date };

export type RateLimitOptions = {
  /** Attempts allowed inside one window. The (max + 1)th attempt is blocked. */
  max: number;
  windowMs: number;
};

export type RateLimitDecision =
  | { action: "start"; windowEndsAt: Date }
  | { action: "increment"; count: number }
  | { action: "block"; retryAfterSeconds: number };

/** Pure: decides what to do with a bucket's current row. No I/O, so it's unit-tested directly. */
export function decideRateLimit(
  row: RateLimitRow | null,
  now: Date,
  { max, windowMs }: RateLimitOptions,
): RateLimitDecision {
  if (!row || row.windowEndsAt <= now) {
    return { action: "start", windowEndsAt: new Date(now.getTime() + windowMs) };
  }
  if (row.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((row.windowEndsAt.getTime() - now.getTime()) / 1000));
    return { action: "block", retryAfterSeconds };
  }
  return { action: "increment", count: row.count + 1 };
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Expired rows are swept once their window has been over for this long. */
const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Consumes one attempt from `bucket` (e.g. `login:email:foo@bar.com`). Locks the row for the
 * duration of the transaction so concurrent Passenger processes can't both slip past the limit.
 * READ COMMITTED: under the default REPEATABLE READ, locking a row that doesn't exist yet takes
 * a gap lock, and two requests starting *different* new buckets at once then deadlock on their
 * inserts (seen in the concurrent checkout test). Without gap locks each insert stands alone.
 */
export async function consumeRateLimit(bucket: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const now = new Date();

  const result = await db.transaction(
    async (tx) => {
      const [existing] = await tx.select().from(rateLimits).where(eq(rateLimits.bucket, bucket)).for("update");
      const decision = decideRateLimit(existing ?? null, now, options);

      if (decision.action === "block") {
        return { allowed: false as const, retryAfterSeconds: decision.retryAfterSeconds, started: false };
      }

      if (decision.action === "start") {
        await tx
          .insert(rateLimits)
          .values({ bucket, count: 1, windowEndsAt: decision.windowEndsAt })
          .onDuplicateKeyUpdate({ set: { count: 1, windowEndsAt: decision.windowEndsAt } });
        return { allowed: true as const, started: true };
      }

      await tx.update(rateLimits).set({ count: decision.count }).where(eq(rateLimits.bucket, bucket));
      return { allowed: true as const, started: false };
    },
    { isolationLevel: "read committed" },
  );

  // A new window is the rare moment to sweep rows whose window ended long ago (S22 BUG-17): after
  // the transaction, so the sweep never holds locks alongside the bucket row, and well past expiry,
  // so it never races a bucket another request is just reopening.
  if (result.started) await db.delete(rateLimits).where(lt(rateLimits.windowEndsAt, new Date(now.getTime() - SWEEP_AFTER_MS)));
  return result.allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
}

/** Clears a bucket, e.g. after a successful login so a correct password doesn't count against the limit. */
export async function resetRateLimit(bucket: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.bucket, bucket));
}
