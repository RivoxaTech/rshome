import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";

export type PanelNavItem = {
  label: string;
  href: string;
  permission: PermissionKey;
};

/** Menu items are gated by permission, never by role name, so a role change alone can grant access. */
export const PANEL_NAV_ITEMS: PanelNavItem[] = [
  { label: "Dashboard", href: "/panel", permission: PERMISSIONS.DASHBOARD_VIEW },
  { label: "Products", href: "/panel/products", permission: PERMISSIONS.PRODUCT_CREATE },
];
