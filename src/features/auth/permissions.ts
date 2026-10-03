/**
 * The source of truth for permission keys (REQUIREMENTS §3.2, DATABASE.md, and
 * client decisions D19/D20/DB18 in ARCHITECTURE.md §9). The seed script upserts these
 * into the `permissions` table and syncs the sets below onto the matching system roles.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  ORDER_VIEW: "order.view",
  ORDER_UPDATE_STATUS: "order.update_status",
  ORDER_VERIFY_PAYMENT: "order.verify_payment",
  ORDER_SET_SHIPPING: "order.set_shipping",
  ORDER_EXPORT: "order.export",
  WHOLESALE_VIEW: "wholesale.view",
  WHOLESALE_MANAGE: "wholesale.manage",
  SETTINGS_BANK: "settings.bank",
  PRODUCT_VIEW: "product.view",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",
  PRODUCT_IMPORT: "product.import",
  PRODUCT_EXPORT: "product.export",
  CATEGORY_MANAGE: "category.manage",
  DISCOUNT_MANAGE: "discount.manage",
  COUPON_MANAGE: "coupon.manage",
  SHIPPING_MANAGE: "shipping.manage",
  SETTINGS_MANAGE: "settings.manage",
  USER_MANAGE: "user.manage",
  ROLE_MANAGE: "role.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PERMISSIONS.DASHBOARD_VIEW]: "View revenue and store statistics",
  [PERMISSIONS.ORDER_VIEW]: "View orders",
  [PERMISSIONS.ORDER_UPDATE_STATUS]: "Update order status",
  [PERMISSIONS.ORDER_VERIFY_PAYMENT]: "Approve or reject payment screenshots",
  [PERMISSIONS.ORDER_SET_SHIPPING]: "Set the shipping charge on a quote-pending order",
  [PERMISSIONS.ORDER_EXPORT]: "Export orders to CSV",
  [PERMISSIONS.WHOLESALE_VIEW]: "View wholesale inquiries",
  [PERMISSIONS.WHOLESALE_MANAGE]: "Change wholesale inquiry status and add internal notes",
  [PERMISSIONS.SETTINGS_BANK]: "Manage bank accounts, contact details and the WhatsApp number",
  [PERMISSIONS.PRODUCT_VIEW]: "View products",
  [PERMISSIONS.PRODUCT_CREATE]: "Create products",
  [PERMISSIONS.PRODUCT_UPDATE]: "Edit products",
  [PERMISSIONS.PRODUCT_DELETE]: "Archive or delete products",
  [PERMISSIONS.PRODUCT_IMPORT]: "Bulk import products",
  [PERMISSIONS.PRODUCT_EXPORT]: "Export products to CSV",
  [PERMISSIONS.CATEGORY_MANAGE]: "Manage categories",
  [PERMISSIONS.DISCOUNT_MANAGE]: "Manage discounts",
  [PERMISSIONS.COUPON_MANAGE]: "Manage coupons",
  [PERMISSIONS.SHIPPING_MANAGE]: "Manage shipping zones",
  [PERMISSIONS.SETTINGS_MANAGE]: "Manage store settings",
  [PERMISSIONS.USER_MANAGE]: "Manage users",
  [PERMISSIONS.ROLE_MANAGE]: "Manage roles and their permissions",
  [PERMISSIONS.AUDIT_VIEW]: "View the audit log",
};

/**
 * Admin default set (BUILD_PLAN.md C24, reversing C6: Admin no longer gets `product.view`,
 * and gains `settings.bank`). Disjoint from `DEVELOPER_DEFAULT_PERMISSIONS` below — the seed
 * sync asserts this, and a unit test does too.
 */
export const ADMIN_DEFAULT_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_UPDATE_STATUS,
  PERMISSIONS.ORDER_VERIFY_PAYMENT,
  PERMISSIONS.ORDER_SET_SHIPPING,
  PERMISSIONS.ORDER_EXPORT,
  PERMISSIONS.WHOLESALE_VIEW,
  PERMISSIONS.WHOLESALE_MANAGE,
  PERMISSIONS.SETTINGS_BANK,
];

/**
 * Developer default set (BUILD_PLAN.md C24): no longer "every permission" — it loses
 * `dashboard.view` and every `order.*`/`wholesale.*` key, so orders, payment screenshots,
 * wholesale inquiries and customer data are hidden from the Developer.
 */
export const DEVELOPER_DEFAULT_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.PRODUCT_CREATE,
  PERMISSIONS.PRODUCT_UPDATE,
  PERMISSIONS.PRODUCT_DELETE,
  PERMISSIONS.PRODUCT_IMPORT,
  PERMISSIONS.PRODUCT_EXPORT,
  PERMISSIONS.CATEGORY_MANAGE,
  PERMISSIONS.DISCOUNT_MANAGE,
  PERMISSIONS.COUPON_MANAGE,
  PERMISSIONS.SHIPPING_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.ROLE_MANAGE,
  PERMISSIONS.AUDIT_VIEW,
];

/**
 * What a system role's `role_permissions` rows should become, given its default set and what it
 * currently holds (ARCHITECTURE.md §4.5): the seed sync grants what's missing and revokes what's
 * no longer listed, so reversing a role's access takes effect on the next seed run. Pure, so it's
 * unit-tested directly; `features/auth/repo.ts` does the actual grant/revoke I/O.
 */
export function diffRolePermissions(
  desired: readonly PermissionKey[],
  current: readonly PermissionKey[],
): { toGrant: PermissionKey[]; toRevoke: PermissionKey[] } {
  const desiredSet = new Set(desired);
  const currentSet = new Set(current);
  return {
    toGrant: desired.filter((key) => !currentSet.has(key)),
    toRevoke: current.filter((key) => !desiredSet.has(key)),
  };
}
