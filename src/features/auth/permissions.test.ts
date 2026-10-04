import { describe, expect, it } from "vitest";
import {
  ADMIN_DEFAULT_PERMISSIONS,
  CONFIGURATION_PERMISSIONS,
  CUSTOMER_DATA_PERMISSIONS,
  DEVELOPER_DEFAULT_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ROLE_DEFAULTS,
  sensitiveGrants,
} from "./permissions";

describe("ADMIN_DEFAULT_PERMISSIONS / DEVELOPER_DEFAULT_PERMISSIONS", () => {
  // The DEFAULT sets stay disjoint (BUILD_PLAN.md C24). The LIVE sets in the database may overlap
  // since S20: the roles page can grant any key to any role, and the seed never revokes.
  it("are disjoint as first-run defaults", () => {
    const adminSet = new Set(ADMIN_DEFAULT_PERMISSIONS);
    const overlap = DEVELOPER_DEFAULT_PERMISSIONS.filter((key) => adminSet.has(key));
    expect(overlap).toEqual([]);
  });

  it("Admin holds settings.bank but not product.view", () => {
    expect(ADMIN_DEFAULT_PERMISSIONS).toContain(PERMISSIONS.SETTINGS_BANK);
    expect(ADMIN_DEFAULT_PERMISSIONS).not.toContain(PERMISSIONS.PRODUCT_VIEW);
  });

  it("Developer holds none of dashboard.view or any order.*/wholesale.* key", () => {
    const forbidden = [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.ORDER_VIEW,
      PERMISSIONS.ORDER_UPDATE_STATUS,
      PERMISSIONS.ORDER_VERIFY_PAYMENT,
      PERMISSIONS.ORDER_SET_SHIPPING,
      PERMISSIONS.ORDER_EXPORT,
      PERMISSIONS.WHOLESALE_VIEW,
      PERMISSIONS.WHOLESALE_MANAGE,
    ];
    for (const key of forbidden) expect(DEVELOPER_DEFAULT_PERMISSIONS).not.toContain(key);
  });

  it("are what SYSTEM_ROLE_DEFAULTS hands the seed", () => {
    expect(SYSTEM_ROLE_DEFAULTS.developer.permissions).toBe(DEVELOPER_DEFAULT_PERMISSIONS);
    expect(SYSTEM_ROLE_DEFAULTS.admin.permissions).toBe(ADMIN_DEFAULT_PERMISSIONS);
  });
});

describe("sensitive grants (S20)", () => {
  it("customer-data and configuration keys together cover every permission exactly once", () => {
    const all = [...CUSTOMER_DATA_PERMISSIONS, ...CONFIGURATION_PERMISSIONS];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(Object.values(PERMISSIONS)));
  });

  it("flags a customer-data key newly granted to the developer role, and a configuration key to the admin role", () => {
    expect(sensitiveGrants("developer", DEVELOPER_DEFAULT_PERMISSIONS, [...DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS.ORDER_VIEW])).toEqual([PERMISSIONS.ORDER_VIEW]);
    expect(sensitiveGrants("admin", ADMIN_DEFAULT_PERMISSIONS, [...ADMIN_DEFAULT_PERMISSIONS, PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.ROLE_MANAGE])).toEqual([
      PERMISSIONS.PRODUCT_VIEW,
      PERMISSIONS.ROLE_MANAGE,
    ]);
  });

  it("ignores keys the role already holds, keys on its own side, removals, and custom roles", () => {
    expect(sensitiveGrants("developer", [PERMISSIONS.ORDER_VIEW], [PERMISSIONS.ORDER_VIEW, PERMISSIONS.PRODUCT_VIEW])).toEqual([]);
    expect(sensitiveGrants("admin", [], [PERMISSIONS.ORDER_VIEW, PERMISSIONS.SETTINGS_BANK])).toEqual([]);
    expect(sensitiveGrants("developer", [PERMISSIONS.ORDER_VIEW, PERMISSIONS.PRODUCT_VIEW], [PERMISSIONS.PRODUCT_VIEW])).toEqual([]);
    expect(sensitiveGrants("ops-team", [], Object.values(PERMISSIONS))).toEqual([]);
  });
});
