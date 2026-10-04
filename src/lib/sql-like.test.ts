import { describe, expect, it } from "vitest";
import { likeContains } from "./sql-like";

describe("likeContains", () => {
  it("wraps plain text in wildcards", () => {
    expect(likeContains("RSH-2610")).toBe("%RSH-2610%");
  });

  it("escapes every LIKE metacharacter so the search is literal", () => {
    expect(likeContains("50%")).toBe("%50\\%%");
    expect(likeContains("a_b")).toBe("%a\\_b%");
    expect(likeContains("back\\slash")).toBe("%back\\\\slash%");
    expect(likeContains("_")).toBe("%\\_%");
  });
});
