/**
 * The source of truth for permission keys (REQUIREMENTS §3.2, DATABASE.md, and
 * client decisions D19/D20 in ARCHITECTURE.md §9). The seed script upserts these
 * into the `permissions` table and grants the sets below to the matching roles.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  ORDER_VIEW: "order.view",
  ORDER_UPDATE_STATUS: "order.update_status",
  ORDER_VERIFY_PAYMENT: "order.verify_payment",
  ORDER_SET_SHIPPING: "order.set_shipping",
  ORDER_EXPORT: "order.export",
  WHOLESALE_VIEW: "wholesale.view",
  PRODUCT_VIEW: "product.view",
  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",
  PRODUCT_IMPORT: "product.import",
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
  [PERMISSIONS.PRODUCT_VIEW]: "View products",
  [PERMISSIONS.PRODUCT_CREATE]: "Create products",
  [PERMISSIONS.PRODUCT_UPDATE]: "Edit products",
  [PERMISSIONS.PRODUCT_DELETE]: "Archive or delete products",
  [PERMISSIONS.PRODUCT_IMPORT]: "Bulk import products",
  [PERMISSIONS.CATEGORY_MANAGE]: "Manage categories",
  [PERMISSIONS.DISCOUNT_MANAGE]: "Manage discounts",
  [PERMISSIONS.COUPON_MANAGE]: "Manage coupons",
  [PERMISSIONS.SHIPPING_MANAGE]: "Manage shipping zones",
  [PERMISSIONS.SETTINGS_MANAGE]: "Manage store settings",
  [PERMISSIONS.USER_MANAGE]: "Manage users",
  [PERMISSIONS.ROLE_MANAGE]: "Manage roles and their permissions",
  [PERMISSIONS.AUDIT_VIEW]: "View the audit log",
};

/** Admin default set (DATABASE.md, C6). Developer always gets every permission. */
export const ADMIN_DEFAULT_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_UPDATE_STATUS,
  PERMISSIONS.ORDER_VERIFY_PAYMENT,
  PERMISSIONS.ORDER_SET_SHIPPING,
  PERMISSIONS.ORDER_EXPORT,
  PERMISSIONS.WHOLESALE_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
];
