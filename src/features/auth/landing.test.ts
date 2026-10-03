import { describe, expect, it } from "vitest";
import { firstAllowedPath } from "./landing";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "./permissions";

describe("firstAllowedPath", () => {
  it("lands the Admin on the dashboard", () => {
    expect(firstAllowedPath(new Set(ADMIN_DEFAULT_PERMISSIONS))).toBe("/panel");
  });

  it("lands the Developer on products (no dashboard.view since C24)", () => {
    expect(firstAllowedPath(new Set(DEVELOPER_DEFAULT_PERMISSIONS))).toBe("/panel/products");
  });

  it("falls back to the account page for a user with no permissions", () => {
    expect(firstAllowedPath(new Set())).toBe("/panel/account");
  });

  it("lands a partial role with only order.view on the bank orders page", () => {
    const permissions = new Set<PermissionKey>([PERMISSIONS.ORDER_VIEW]);
    expect(firstAllowedPath(permissions)).toBe("/panel/orders/bank");
  });

  it("lands a partial role with only settings.manage on settings, and only settings.bank on the bank page (S14)", () => {
    expect(firstAllowedPath(new Set<PermissionKey>([PERMISSIONS.SETTINGS_MANAGE]))).toBe("/panel/settings");
    expect(firstAllowedPath(new Set<PermissionKey>([PERMISSIONS.SETTINGS_BANK]))).toBe("/panel/settings/bank");
  });

  it("lands a partial role with only shipping.manage on shipping (S14)", () => {
    expect(firstAllowedPath(new Set<PermissionKey>([PERMISSIONS.SHIPPING_MANAGE]))).toBe("/panel/shipping");
    // Shipping comes before settings, matching the sidebar's order.
    expect(firstAllowedPath(new Set<PermissionKey>([PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.SHIPPING_MANAGE]))).toBe("/panel/shipping");
  });

  it("keeps the full Admin set on the dashboard and the full Developer set on products despite the new entries", () => {
    expect(firstAllowedPath(new Set(ADMIN_DEFAULT_PERMISSIONS))).toBe("/panel");
    expect(firstAllowedPath(new Set(DEVELOPER_DEFAULT_PERMISSIONS))).toBe("/panel/products");
  });

  it("lands a partial role with only category.manage on categories", () => {
    const permissions = new Set<PermissionKey>([PERMISSIONS.CATEGORY_MANAGE]);
    expect(firstAllowedPath(permissions)).toBe("/panel/categories");
  });

  it("lands a partial role with only discount.manage on discounts, and only coupon.manage on coupons (S12/S13)", () => {
    expect(firstAllowedPath(new Set<PermissionKey>([PERMISSIONS.DISCOUNT_MANAGE]))).toBe("/panel/discounts");
    expect(firstAllowedPath(new Set<PermissionKey>([PERMISSIONS.COUPON_MANAGE]))).toBe("/panel/coupons");
    // Both held: discounts first, matching the sidebar's order.
    expect(firstAllowedPath(new Set<PermissionKey>([PERMISSIONS.COUPON_MANAGE, PERMISSIONS.DISCOUNT_MANAGE]))).toBe("/panel/discounts");
  });
});
