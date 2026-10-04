import { describe, expect, it } from "vitest";
import { MASKED, MAX_VALUE_LENGTH, buildAuditDiff, formatValue } from "./diff";

describe("buildAuditDiff", () => {
  it("lists every key from both sides and flags the changed ones", () => {
    const diff = buildAuditDiff(JSON.stringify({ name: "A", price: "100.00", status: "draft" }), JSON.stringify({ name: "A", price: "120.00", slug: "a" }));
    expect(diff.kind).toBe("diff");
    if (diff.kind !== "diff") return;
    expect(diff.rows.map((row) => [row.key, row.changed])).toEqual([
      ["name", false],
      ["price", true],
      ["status", true],
      ["slug", true],
    ]);
    expect(diff.rows.find((row) => row.key === "status")).toMatchObject({ oldValue: "draft", newValue: null });
  });

  it("never marks a one-sided snapshot (create/delete) as changed", () => {
    const diff = buildAuditDiff(null, JSON.stringify({ name: "New" }));
    expect(diff.kind === "diff" && diff.rows[0]).toMatchObject({ key: "name", oldValue: null, newValue: "New", changed: false });
  });

  it("pretty-prints nested values and masks secret-looking keys whatever their value", () => {
    const diff = buildAuditDiff(null, JSON.stringify({ permissions: ["a", "b"], passwordHash: "scrypt:1:2:3:aa:bb", token: "x" }));
    if (diff.kind !== "diff") throw new Error("expected a diff");
    expect(diff.rows[0].newValue).toBe('[\n  "a",\n  "b"\n]');
    expect(diff.rows[1].newValue).toBe(MASKED);
    expect(diff.rows[2].newValue).toBe(MASKED);
    expect(JSON.stringify(diff)).not.toContain("scrypt");
  });

  it("shows unparseable or non-object snapshots raw instead of failing", () => {
    expect(buildAuditDiff("not json", null)).toEqual({ kind: "diff", rows: [{ key: "__unparseable", oldValue: "not json", newValue: null, changed: false }] });
    expect(buildAuditDiff(JSON.stringify(["a"]), JSON.stringify({ x: 1 }))).toEqual({ kind: "raw", oldText: '[\n  "a"\n]', newText: '{\n  "x": 1\n}' });
  });

  it("truncates a huge value but still compares the full one", () => {
    const long = "x".repeat(MAX_VALUE_LENGTH + 50);
    const formatted = formatValue(long);
    expect(formatted).toHaveLength(MAX_VALUE_LENGTH + "… (50 more characters)".length);
    const diff = buildAuditDiff(JSON.stringify({ note: long }), JSON.stringify({ note: `${long}y` }));
    expect(diff.kind === "diff" && diff.rows[0].changed).toBe(true);
  });
});
