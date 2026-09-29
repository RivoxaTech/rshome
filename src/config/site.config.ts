/**
 * Build-time defaults (ARCHITECTURE.md §4.6). The `settings` table holds the runtime-editable
 * versions of `contact`, `socialLinks` and `bankAccounts` (features/settings) and wins when a
 * row exists; these are the fallback when a settings row is missing, and the source for values
 * that aren't in `settings` yet (store name, logo text, nav copy, timezone, order numbers).
 */
export const siteConfig = {
  storeName: "RS Home",
  logoText: "RS Home",
  tagline:
    "RS HOME curates luxury tableware, tea sets, trays and decor in DHA Phase 6, Karachi. Nationwide delivery, wholesale and bulk orders available.",
  announcementText: "Nationwide Delivery • Wholesale & Bulk Orders Available",
  footerTagline: "Home Essentials · Elegant Tableware · Tea Sets · Trays · Decor",
  /** Shown wherever the delivery charge is still pending (client decision C13: quoted on WhatsApp). */
  deliveryPendingNote: "Delivery charge: to be confirmed, we will contact you on WhatsApp",
  timezone: "Asia/Karachi",
  /** Order numbers are `PREFIX-YYMMDD-XXXX` (ARCHITECTURE.md D14). */
  orderNumberPrefix: "RSH",
  /** The customer-to-shop WhatsApp message on the order page; `{orderNumber}` is filled in. */
  orderWhatsAppMessage: "Hello RS Home, I have a question about my order {orderNumber}.",
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
  /**
   * PLACEHOLDER until the client sends real details (REQUIREMENTS.md §16). The seeded
   * `bank_accounts` settings row carries the same placeholders; S14 adds the panel editor.
   */
  bankAccounts: [
    {
      bankName: "[PLACEHOLDER] Bank name",
      accountTitle: "[PLACEHOLDER] Account title",
      accountNumber: "[PLACEHOLDER] 0000-0000000-0",
      iban: "[PLACEHOLDER] PK00XXXX0000000000000000",
      note: null,
    },
  ],
} as const;
