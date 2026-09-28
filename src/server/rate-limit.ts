import { eq } from "drizzle-orm";
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

/**
 * Consumes one attempt from `bucket` (e.g. `login:email:foo@bar.com`). Locks the row for the
 * duration of the transaction so concurrent Passenger processes can't both slip past the limit.
 */
export async function consumeRateLimit(bucket: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(rateLimits).where(eq(rateLimits.bucket, bucket)).for("update");
    const decision = decideRateLimit(existing ?? null, now, options);

    if (decision.action === "block") {
      return { allowed: false, retryAfterSeconds: decision.retryAfterSeconds };
    }

    if (decision.action === "start") {
      await tx
        .insert(rateLimits)
        .values({ bucket, count: 1, windowEndsAt: decision.windowEndsAt })
        .onDuplicateKeyUpdate({ set: { count: 1, windowEndsAt: decision.windowEndsAt } });
      return { allowed: true };
    }

    await tx.update(rateLimits).set({ count: decision.count }).where(eq(rateLimits.bucket, bucket));
    return { allowed: true };
  });
}

/** Clears a bucket, e.g. after a successful login so a correct password doesn't count against the limit. */
export async function resetRateLimit(bucket: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.bucket, bucket));
}
