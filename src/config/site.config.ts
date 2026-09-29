/**
 * Build-time defaults (ARCHITECTURE.md §4.6). The `settings` table holds the runtime-editable
 * versions of `contact` and `socialLinks` (features/settings) and wins when a row exists;
 * these are the fallback when a settings row is missing, and the source for values that
 * aren't in `settings` yet (store name, logo text, nav copy, timezone).
 */
export const siteConfig = {
  storeName: "RS Home",
  logoText: "RS Home",
  tagline:
    "RS HOME curates luxury tableware, tea sets, trays and decor in DHA Phase 6, Karachi. Nationwide delivery, wholesale and bulk orders available.",
  announcementText: "Nationwide Delivery • Wholesale & Bulk Orders Available",
  footerTagline: "Home Essentials · Elegant Tableware · Tea Sets · Trays · Decor",
  timezone: "Asia/Karachi",
  contact: {
    phone: "03218581969",
    whatsapp: "923218581969",
    address: "Shop #2 & #3, Plot 3C, Lane 9, Bukhari Commercial, DHA Phase 6, Karachi, Pakistan",
  },
  socialLinks: {
    facebook: "https://www.facebook.com/share/1BzHaKucmx/",
    instagram: "https://www.instagram.com/reema_shamsi",
    instagramHandle: "@reema_shamsi",
  },
} as const;
