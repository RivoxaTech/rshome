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
 * The sidebar's registry (owner decision S9, rebuilt S9b for the disjoint role sets): Dashboard
 * and the two orders pages (Admin), Products (Developer). Menu items are gated by permission,
 * never by role name — the admin holds none of `products`' permission, so it never shows for
 * them. Items for later slices (wholesale, settings, users, audit) are added here by those slices.
 */
export const PANEL_NAV_ITEMS: PanelNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/panel", icon: "dashboard", permission: PERMISSIONS.DASHBOARD_VIEW },
  { key: "orders-bank", label: "Orders – Bank transfer", href: "/panel/orders/bank", icon: "bank", permission: PERMISSIONS.ORDER_VIEW },
  { key: "orders-cod", label: "Orders – COD", href: "/panel/orders/cod", icon: "cash", permission: PERMISSIONS.ORDER_VIEW },
  { key: "products", label: "Products", href: "/panel/products", icon: "box", permission: PERMISSIONS.PRODUCT_VIEW },
];
