import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StaffActionError, invalidInput, refusal } from "./staff-result";

describe("invalidInput", () => {
  it("returns the first issue's message and one message per field", () => {
    const parsed = z.object({ name: z.string().min(1, "Name is required."), price: z.number({ error: "Enter a price." }) }).safeParse({ name: "", price: "x" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(invalidInput(parsed.error)).toEqual({ ok: false, error: "Name is required.", fieldErrors: { name: "Name is required.", price: "Enter a price." } });
  });
});

describe("refusal", () => {
  it("carries a field error only when the refusal names a field", () => {
    expect(refusal(new StaffActionError("Not found."))).toEqual({ ok: false, error: "Not found." });
    expect(refusal(new StaffActionError("Already in use.", "slug"))).toEqual({ ok: false, error: "Already in use.", fieldErrors: { slug: "Already in use." } });
  });
});
