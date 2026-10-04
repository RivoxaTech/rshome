import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import type { ICON_PATHS } from "@/components/ui/Icon";

export type PanelNavItem = {
  key: string;
  label: string;
  href: string;
  icon: keyof typeof ICON_PATHS;
  permission: PermissionKey;
};

/**
 * The sidebar's registry (owner decision S9, rebuilt S9b for the disjoint default role sets):
 * Dashboard, the two orders pages, Wholesale and Bank & contact (Admin by default); Categories/
 * Products/Discounts/Coupons/Shipping/Settings/Users/Roles/Audit log (Developer by default). Menu
 * items are gated by permission, never by role name — so when the permissions matrix (S20, C34)
 * gives the Admin role `product.view`, Products simply appears for them on their next sign-in.
 */
export const PANEL_NAV_ITEMS: PanelNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/panel", icon: "dashboard", permission: PERMISSIONS.DASHBOARD_VIEW },
  { key: "orders-bank", label: "Orders – Bank transfer", href: "/panel/orders/bank", icon: "bank", permission: PERMISSIONS.ORDER_VIEW },
  { key: "orders-cod", label: "Orders – COD", href: "/panel/orders/cod", icon: "cash", permission: PERMISSIONS.ORDER_VIEW },
  { key: "wholesale", label: "Wholesale", href: "/panel/wholesale", icon: "wholesale", permission: PERMISSIONS.WHOLESALE_VIEW },
  { key: "settings-bank", label: "Bank & contact", href: "/panel/settings/bank", icon: "card", permission: PERMISSIONS.SETTINGS_BANK },
  { key: "categories", label: "Categories", href: "/panel/categories", icon: "tag", permission: PERMISSIONS.CATEGORY_MANAGE },
  { key: "products", label: "Products", href: "/panel/products", icon: "box", permission: PERMISSIONS.PRODUCT_VIEW },
  { key: "discounts", label: "Discounts", href: "/panel/discounts", icon: "percent", permission: PERMISSIONS.DISCOUNT_MANAGE },
  { key: "coupons", label: "Coupons", href: "/panel/coupons", icon: "ticket", permission: PERMISSIONS.COUPON_MANAGE },
  { key: "shipping", label: "Shipping", href: "/panel/shipping", icon: "truck", permission: PERMISSIONS.SHIPPING_MANAGE },
  { key: "settings", label: "Settings", href: "/panel/settings", icon: "settings", permission: PERMISSIONS.SETTINGS_MANAGE },
  { key: "users", label: "Users", href: "/panel/users", icon: "users", permission: PERMISSIONS.USER_MANAGE },
  { key: "roles", label: "Roles", href: "/panel/roles", icon: "shield", permission: PERMISSIONS.ROLE_MANAGE },
  { key: "audit", label: "Audit log", href: "/panel/audit", icon: "clipboard", permission: PERMISSIONS.AUDIT_VIEW },
];
