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
  /**
   * The shop-to-customer WhatsApp messages on the panel order page, one per stage (C13, C20).
   * `{name}`, `{store}`, `{orderNumber}`, `{deliveryCharge}`, `{total}` and `{orderUrl}` are filled in.
   */
  staffWhatsAppMessages: {
    general: "Hello {name}, this is {store} about your order {orderNumber}.",
    screenshotRejected:
      "Hello {name}, this is {store}. We couldn't accept the payment screenshot for your order {orderNumber}. Please upload a new one here: {orderUrl}",
    approvedDeliveryDue:
      "Hello {name}, your {store} order {orderNumber} is approved. The delivery charge is {deliveryCharge}, so your new total is {total}. Please transfer {deliveryCharge} and upload the screenshot here: {orderUrl}",
    approvedCod:
      "Hello {name}, your {store} order {orderNumber} is approved. The delivery charge is {deliveryCharge}, so your total is {total}, paid in cash on delivery. You can view your order here: {orderUrl}",
    approved:
      "Hello {name}, your {store} order {orderNumber} is approved. Your total is {total}, including the delivery charge of {deliveryCharge}. We're preparing it now: {orderUrl}",
    sent: "Hello {name}, your {store} order {orderNumber} is on its way. You can view your order here: {orderUrl}",
  },
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
