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
 * The sidebar's registry (owner decision S9, rebuilt S9b for the disjoint role sets): Dashboard,
 * the two orders pages, Wholesale and Bank & contact (Admin); Categories/Products/Discounts/
 * Coupons/Shipping/Settings (Developer). Menu items are gated by permission, never by role name —
 * the admin holds none of `products`' permission, so it never shows for them. The two settings
 * pages are gated by their own disjoint keys (C24), so neither role ever sees the other's. Items
 * for later slices (users, audit) are added here by those slices.
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
];
