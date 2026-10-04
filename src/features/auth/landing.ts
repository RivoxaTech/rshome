import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";

/**
 * Where a signed-in user lands, in the fixed priority order from ARCHITECTURE.md §4.5 / DATABASE.md
 * DB18: dashboard, orders (bank, then COD — one permission covers both pages, bank is just the
 * preferred landing), wholesale, products, categories, settings, users, roles, audit (S20). Used for the post-login
 * redirect, the `/panel` dashboard page when the viewer lacks `dashboard.view`, the login page
 * when already signed in, and the 403 page's back link. The two settings permissions land on two
 * different pages (S14): `settings.bank` on the Admin's bank/contact page, `settings.manage` on the
 * Developer's store settings — each is the last Admin-side / Developer-side entry, so a full role
 * never lands there, but a role holding only that one key does. Categories, discounts, coupons and
 * shipping sit after products (S10, S12/S13, S14): the Developer holds all of them by
 * default and keeps landing on products unchanged; the entries exist so a role holding only one of
 * those keys still lands on its own page instead of falling back to `/panel/account`.
 */
const PRIORITY: { permissions: PermissionKey[]; href: string }[] = [
  { permissions: [PERMISSIONS.DASHBOARD_VIEW], href: "/panel" },
  { permissions: [PERMISSIONS.ORDER_VIEW], href: "/panel/orders/bank" },
  { permissions: [PERMISSIONS.WHOLESALE_VIEW], href: "/panel/wholesale" },
  { permissions: [PERMISSIONS.SETTINGS_BANK], href: "/panel/settings/bank" },
  { permissions: [PERMISSIONS.PRODUCT_VIEW], href: "/panel/products" },
  { permissions: [PERMISSIONS.CATEGORY_MANAGE], href: "/panel/categories" },
  { permissions: [PERMISSIONS.DISCOUNT_MANAGE], href: "/panel/discounts" },
  { permissions: [PERMISSIONS.COUPON_MANAGE], href: "/panel/coupons" },
  { permissions: [PERMISSIONS.SHIPPING_MANAGE], href: "/panel/shipping" },
  { permissions: [PERMISSIONS.SETTINGS_MANAGE], href: "/panel/settings" },
  { permissions: [PERMISSIONS.USER_MANAGE], href: "/panel/users" },
  { permissions: [PERMISSIONS.ROLE_MANAGE], href: "/panel/roles" },
  { permissions: [PERMISSIONS.AUDIT_VIEW], href: "/panel/audit" },
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
