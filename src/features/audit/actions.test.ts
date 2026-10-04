import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/features/auth/permissions";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, auditActionLabel, auditEntityLabel } from "./actions";

const permissionKeys = new Set<string>(Object.values(PERMISSIONS));

/**
 * Every `action: "x.y"` literal (and `cond ? "x.y" : "x.z"` pair) and every `entity: "x"` literal
 * written by a service or route under src/, minus tests and this feature's own files.
 */
function literalsInSource(): { actions: Set<string>; entities: Set<string> } {
  const root = path.resolve(__dirname, "..", "..");
  const actions = new Set<string>();
  const entities = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !full.includes(`${path.sep}audit${path.sep}`)) {
        const text = readFileSync(full, "utf8");
        // Only files that write audit rows. Every `"x.y"` literal in them is an action name (passed as
        // `action: "x.y"`, a ternary pair, or positionally through a small helper) — except permission keys,
        // which share the shape and are filtered out below.
        if (!text.includes("insertAuditLog(")) continue;
        for (const match of text.matchAll(/"([a-z_]+\.[a-z_]+)"/g)) {
          if (!permissionKeys.has(match[1])) actions.add(match[1]);
        }
        for (const match of text.matchAll(/\bentity:\s*"([a-z_]+)"/g)) entities.add(match[1]);
      }
    }
  };
  walk(root);
  return { actions, entities };
}

describe("audit action registry", () => {
  it("has unique keys for actions and entities", () => {
    expect(new Set(AUDIT_ACTIONS.map((a) => a.key)).size).toBe(AUDIT_ACTIONS.length);
    expect(new Set(AUDIT_ENTITIES.map((e) => e.key)).size).toBe(AUDIT_ENTITIES.length);
  });

  it("registers every action and entity string the services write (so the filters can reach every row)", () => {
    const { actions, entities } = literalsInSource();
    const registeredActions = new Set(AUDIT_ACTIONS.map((a) => a.key));
    const registeredEntities = new Set(AUDIT_ENTITIES.map((e) => e.key));
    expect([...actions].filter((key) => !registeredActions.has(key))).toEqual([]);
    expect([...entities].filter((key) => !registeredEntities.has(key))).toEqual([]);
    // And the scan actually found well-known literals (a plain one, a ternary pair, an entity), so a regex drift can't
    // silently pass. `settings.update` is deliberately absent here: it's written through a const, registered by hand.
    expect(actions.has("product.image_add")).toBe(true);
    expect(actions.has("coupon.activate") && actions.has("coupon.deactivate")).toBe(true);
    expect(entities.has("product_image_order")).toBe(true);
  });

  it("falls back to the raw key for an unknown action or entity", () => {
    expect(auditActionLabel("settings.update")).toBe("Setting changed");
    expect(auditActionLabel("future.thing")).toBe("future.thing");
    expect(auditEntityLabel("coupon")).toBe("Coupon");
    expect(auditEntityLabel("mystery")).toBe("mystery");
  });
});
