import { describe, expect, it } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, diffRolePermissions, PERMISSIONS } from "./permissions";

describe("ADMIN_DEFAULT_PERMISSIONS / DEVELOPER_DEFAULT_PERMISSIONS", () => {
  it("are disjoint (BUILD_PLAN.md C24)", () => {
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
});

describe("diffRolePermissions", () => {
  it("grants everything when the role currently holds nothing", () => {
    const { toGrant, toRevoke } = diffRolePermissions([PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.CATEGORY_MANAGE], []);
    expect(toGrant).toEqual([PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.CATEGORY_MANAGE]);
    expect(toRevoke).toEqual([]);
  });

  it("revokes a permission the desired set no longer lists", () => {
    const { toGrant, toRevoke } = diffRolePermissions(
      [PERMISSIONS.SETTINGS_BANK],
      [PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.SETTINGS_BANK],
    );
    expect(toGrant).toEqual([]);
    expect(toRevoke).toEqual([PERMISSIONS.PRODUCT_VIEW]);
  });

  it("does nothing once the role already matches the desired set", () => {
    const keys = [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.ORDER_VIEW];
    const { toGrant, toRevoke } = diffRolePermissions(keys, keys);
    expect(toGrant).toEqual([]);
    expect(toRevoke).toEqual([]);
  });

  it("grants and revokes in the same pass (reversing a role's access, like C24 for Admin)", () => {
    const { toGrant, toRevoke } = diffRolePermissions(
      [PERMISSIONS.SETTINGS_BANK],
      [PERMISSIONS.PRODUCT_VIEW],
    );
    expect(toGrant).toEqual([PERMISSIONS.SETTINGS_BANK]);
    expect(toRevoke).toEqual([PERMISSIONS.PRODUCT_VIEW]);
  });
});
