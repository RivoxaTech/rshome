import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/features/auth/permissions";
import { hasPermission } from "./permissions";

describe("hasPermission", () => {
  it("is true when the key is in the granted set", () => {
    const granted = new Set([PERMISSIONS.ORDER_VIEW, PERMISSIONS.DASHBOARD_VIEW]);
    expect(hasPermission(granted, PERMISSIONS.ORDER_VIEW)).toBe(true);
  });

  it("is false when the key is missing", () => {
    const granted = new Set([PERMISSIONS.ORDER_VIEW]);
    expect(hasPermission(granted, PERMISSIONS.PRODUCT_CREATE)).toBe(false);
  });

  it("is false for an empty set", () => {
    expect(hasPermission(new Set(), PERMISSIONS.DASHBOARD_VIEW)).toBe(false);
  });
});
