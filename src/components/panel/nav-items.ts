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
 * The sidebar's only items (owner decision, S9): Dashboard and the two orders pages, one per
 * payment method. Menu items are gated by permission, never by role name. Products (S10, not
 * started) is reachable by its own URL but left off this sidebar until that slice.
 */
export const PANEL_NAV_ITEMS: PanelNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/panel", icon: "dashboard", permission: PERMISSIONS.DASHBOARD_VIEW },
  { key: "orders-bank", label: "Orders – Bank transfer", href: "/panel/orders/bank", icon: "bank", permission: PERMISSIONS.ORDER_VIEW },
  { key: "orders-cod", label: "Orders – COD", href: "/panel/orders/cod", icon: "cash", permission: PERMISSIONS.ORDER_VIEW },
];
