import { describe, expect, it } from "vitest";
import { decideRateLimit } from "./rate-limit";

const OPTIONS = { max: 5, windowMs: 15 * 60 * 1000 };

describe("decideRateLimit", () => {
  it("starts a new window when there is no row", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const decision = decideRateLimit(null, now, OPTIONS);
    expect(decision.action).toBe("start");
  });

  it("starts a new window when the previous one has expired", () => {
    const now = new Date("2026-01-01T00:20:00Z");
    const row = { count: 5, windowEndsAt: new Date("2026-01-01T00:15:00Z") };
    const decision = decideRateLimit(row, now, OPTIONS);
    expect(decision.action).toBe("start");
  });

  it("increments while under the limit", () => {
    const now = new Date("2026-01-01T00:05:00Z");
    const row = { count: 3, windowEndsAt: new Date("2026-01-01T00:15:00Z") };
    const decision = decideRateLimit(row, now, OPTIONS);
    expect(decision).toEqual({ action: "increment", count: 4 });
  });

  it("blocks the (max + 1)th attempt, e.g. the 6th wrong password", () => {
    const now = new Date("2026-01-01T00:05:00Z");
    const row = { count: 5, windowEndsAt: new Date("2026-01-01T00:15:00Z") };
    const decision = decideRateLimit(row, now, OPTIONS);
    expect(decision.action).toBe("block");
    if (decision.action === "block") {
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("treats a reset bucket (row deleted) the same as a never-attempted one", () => {
    // resetRateLimit() deletes the row; a missing row and a deleted row decide identically.
    const now = new Date("2026-01-01T00:05:00Z");
    const afterFiveFailures = { count: 5, windowEndsAt: new Date("2026-01-01T00:15:00Z") };
    const blocked = decideRateLimit(afterFiveFailures, now, OPTIONS);
    expect(blocked.action).toBe("block");

    const afterReset = decideRateLimit(null, now, OPTIONS);
    expect(afterReset.action).toBe("start");
  });
});
