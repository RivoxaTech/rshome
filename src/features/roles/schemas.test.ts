import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/features/auth/permissions";
import { createRoleInputSchema, suggestRoleKey, updateRoleInputSchema } from "./schemas";

describe("role schemas", () => {
  it("parses the comma-separated permissions field into known keys, de-duplicated and in canonical order", () => {
    const parsed = createRoleInputSchema.parse({ name: "Catalogue editor", key: "catalogue-editor", permissions: " product.update, product.view ,product.update,, " });
    expect(parsed.permissions).toEqual([PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.PRODUCT_UPDATE]);
  });

  it("refuses an unknown permission key", () => {
    const result = createRoleInputSchema.safeParse({ name: "Hacker", key: "x-role", permissions: "product.view,order.hack" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["permissions"]);
  });

  it("normalises and validates the key", () => {
    expect(createRoleInputSchema.parse({ name: "Ops", key: "  Ops-Team ", permissions: "" }).key).toBe("ops-team");
    for (const bad of ["a", "has space", "Under_score", "-lead", "trail-", "double--dash"]) {
      expect(createRoleInputSchema.safeParse({ name: "Ops", key: bad, permissions: "" }).success, bad).toBe(false);
    }
  });

  it("requires a version on update and has no key field", () => {
    expect(updateRoleInputSchema.safeParse({ name: "Ops", permissions: "" }).success).toBe(false);
    const parsed = updateRoleInputSchema.parse({ name: "Ops", permissions: "", version: "1@abc" });
    expect(parsed).toEqual({ name: "Ops", permissions: [], version: "1@abc", confirmSensitive: false });
    expect(updateRoleInputSchema.parse({ name: "Ops", permissions: "", version: "1@abc", confirmSensitive: "true" }).confirmSensitive).toBe(true);
  });

  it("suggests a slug from the name", () => {
    expect(suggestRoleKey("Catalogue Editor")).toBe("catalogue-editor");
    expect(suggestRoleKey("  Ops & Support!! ")).toBe("ops-support");
    expect(suggestRoleKey("Café staff")).toBe("cafe-staff");
    expect(suggestRoleKey("")).toBe("");
  });
});
