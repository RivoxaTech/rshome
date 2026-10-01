import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";

/**
 * Where a signed-in user lands, in the fixed priority order from ARCHITECTURE.md §4.5 / DATABASE.md
 * DB18: dashboard, orders (bank, then COD — one permission covers both pages, bank is just the
 * preferred landing), wholesale, products, settings, users, audit. Used for the post-login
 * redirect, the `/panel` dashboard page when the viewer lacks `dashboard.view`, the login page
 * when already signed in, and the 403 page's back link. `settings` checks either settings
 * permission, since Admin and Developer each hold a different half of it.
 */
const PRIORITY: { permissions: PermissionKey[]; href: string }[] = [
  { permissions: [PERMISSIONS.DASHBOARD_VIEW], href: "/panel" },
  { permissions: [PERMISSIONS.ORDER_VIEW], href: "/panel/orders/bank" },
  { permissions: [PERMISSIONS.WHOLESALE_VIEW], href: "/panel/wholesale" },
  { permissions: [PERMISSIONS.PRODUCT_VIEW], href: "/panel/products" },
  { permissions: [PERMISSIONS.SETTINGS_BANK, PERMISSIONS.SETTINGS_MANAGE], href: "/panel/settings" },
  { permissions: [PERMISSIONS.USER_MANAGE], href: "/panel/users" },
  { permissions: [PERMISSIONS.AUDIT_VIEW], href: "/panel/audit-log" },
];

/** Any signed-in user can always reach their own account page, permission or not. */
const FALLBACK_HREF = "/panel/account";

/** Pure: no I/O, so it's unit-tested directly. */
export function firstAllowedPath(permissions: ReadonlySet<PermissionKey>): string {
  for (const step of PRIORITY) {
    if (step.permissions.some((key) => permissions.has(key))) return step.href;
  }
  return FALLBACK_HREF;
}
