import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";

/**
 * How the roles page groups permission keys (S20): one group per area of the panel, in the
 * sidebar's own order. Pure data; a unit test asserts every `PERMISSIONS` key appears exactly once.
 */
type PermissionGroup = { key: string; label: string; permissions: PermissionKey[] };

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "orders",
    label: "Orders and dashboard",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.ORDER_VIEW,
      PERMISSIONS.ORDER_UPDATE_STATUS,
      PERMISSIONS.ORDER_VERIFY_PAYMENT,
      PERMISSIONS.ORDER_SET_SHIPPING,
      PERMISSIONS.ORDER_EXPORT,
    ],
  },
  { key: "wholesale", label: "Wholesale", permissions: [PERMISSIONS.WHOLESALE_VIEW, PERMISSIONS.WHOLESALE_MANAGE] },
  {
    key: "products",
    label: "Products",
    permissions: [
      PERMISSIONS.PRODUCT_VIEW,
      PERMISSIONS.PRODUCT_CREATE,
      PERMISSIONS.PRODUCT_UPDATE,
      PERMISSIONS.PRODUCT_DELETE,
      PERMISSIONS.PRODUCT_IMPORT,
      PERMISSIONS.PRODUCT_EXPORT,
    ],
  },
  {
    key: "catalogue",
    label: "Catalogue config",
    permissions: [PERMISSIONS.CATEGORY_MANAGE, PERMISSIONS.DISCOUNT_MANAGE, PERMISSIONS.COUPON_MANAGE, PERMISSIONS.SHIPPING_MANAGE],
  },
  { key: "settings", label: "Store settings", permissions: [PERMISSIONS.SETTINGS_BANK, PERMISSIONS.SETTINGS_MANAGE] },
  { key: "access", label: "Users and audit", permissions: [PERMISSIONS.USER_MANAGE, PERMISSIONS.ROLE_MANAGE, PERMISSIONS.AUDIT_VIEW] },
];

/** The two keys that let a role change who has access — a role holding either gets a plain warning on the roles page. */
export const ACCESS_CONTROL_PERMISSIONS: PermissionKey[] = [PERMISSIONS.USER_MANAGE, PERMISSIONS.ROLE_MANAGE];
