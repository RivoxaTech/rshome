import { describe, expect, it } from "vitest";
import { isDuplicateEntry, mysqlErrorOf } from "./errors";

/** The shape mysql2 throws for a unique-index collision. */
const driverError = Object.assign(new Error("Duplicate entry 'x' for key 'products_slug_unique'"), { errno: 1062, sqlMessage: "Duplicate entry 'x' for key 'products_slug_unique'" });

describe("isDuplicateEntry", () => {
  it("recognises the bare driver error", () => {
    expect(isDuplicateEntry(driverError)).toBe(true);
  });

  it("recognises the error once Drizzle has wrapped it on `cause` (the shape the services actually see)", () => {
    const wrapped = new Error("Failed query: insert into products ...", { cause: driverError });
    expect(isDuplicateEntry(wrapped)).toBe(true);
    expect(mysqlErrorOf(wrapped)?.sqlMessage).toContain("products_slug_unique");
  });

  it("is false for anything else", () => {
    expect(isDuplicateEntry(new Error("boom"))).toBe(false);
    expect(isDuplicateEntry(Object.assign(new Error("deadlock"), { errno: 1213 }))).toBe(false);
    expect(isDuplicateEntry(null)).toBe(false);
    expect(isDuplicateEntry("string")).toBe(false);
  });
});
