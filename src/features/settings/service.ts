import { cache } from "react";
import { siteConfig } from "@/config/site.config";
import { getSettingValue } from "@/features/settings/repo";
import {
  type BankAccount,
  type Contact,
  type NotifyRecipients,
  type SocialLinks,
  type StoreIdentity,
  announcementTextSchema,
  bankAccountsSchema,
  contactSchema,
  notifyRecipientsSchema,
  socialLinksSchema,
  storeIdentitySchema,
} from "@/features/settings/schemas";

/**
 * The `settings` keys (DATABASE.md "Other"). Every storefront reader below goes through one of
 * these; the panel's writers (`staff-service.ts`) save under the same names.
 */
export const SETTING_KEYS = {
  contact: "contact",
  socialLinks: "social_links",
  bankAccounts: "bank_accounts",
  storeIdentity: "store_identity",
  announcementText: "announcement_text",
  notifyOwnerOrderEmails: "notify_owner_order_emails",
  notifyOwnerWholesaleEmails: "notify_owner_wholesale_emails",
} as const;

// Falls back to config/site.config.ts when the settings row is missing or fails validation
// (ARCHITECTURE.md §4.6), so a bad or absent row never breaks the storefront shell. Each reader is
// memoised per request with React `cache()` — pages render per request (D7), so a saved change is
// visible on the very next request with no cache to clear.
async function readSetting<T>(key: string, schema: { parse: (v: unknown) => T }, fallback: T): Promise<T> {
  const raw = await getSettingValue(key);
  if (!raw) return fallback;
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export const getContactInfo = cache((): Promise<Contact> =>
  readSetting(SETTING_KEYS.contact, contactSchema, siteConfig.contact),
);

export const getSocialLinks = cache((): Promise<SocialLinks> =>
  readSetting(SETTING_KEYS.socialLinks, socialLinksSchema, siteConfig.socialLinks),
);

export const getBankAccounts = cache((): Promise<BankAccount[]> =>
  readSetting(SETTING_KEYS.bankAccounts, bankAccountsSchema, [...siteConfig.bankAccounts]),
);

/** Store name and logo text (S14): the header, footer, panel sidebar, emails and WhatsApp messages all read this. */
export const getStoreIdentity = cache((): Promise<StoreIdentity> =>
  readSetting(SETTING_KEYS.storeIdentity, storeIdentitySchema, { storeName: siteConfig.storeName, logoText: siteConfig.logoText }),
);

/** The top announcement bar's text (S14); an empty string hides the bar. */
export const getAnnouncementText = cache((): Promise<string> =>
  readSetting(SETTING_KEYS.announcementText, announcementTextSchema, siteConfig.announcementText),
);

/** Off by default (empty list) — push is the primary new-order alert (BUILD_PLAN.md C26). */
export const getNotifyOwnerOrderEmails = cache((): Promise<NotifyRecipients> =>
  readSetting(SETTING_KEYS.notifyOwnerOrderEmails, notifyRecipientsSchema, []),
);

/** Also empty by default (owner decision C26); filled in on `/panel/settings`. */
export const getNotifyOwnerWholesaleEmails = cache((): Promise<NotifyRecipients> =>
  readSetting(SETTING_KEYS.notifyOwnerWholesaleEmails, notifyRecipientsSchema, []),
);
