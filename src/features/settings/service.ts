import { cache } from "react";
import { siteConfig } from "@/config/site.config";
import { getSettingValue } from "@/features/settings/repo";
import {
  type BankAccount,
  type Contact,
  type NotifyRecipients,
  type SocialLinks,
  bankAccountsSchema,
  contactSchema,
  notifyRecipientsSchema,
  socialLinksSchema,
} from "@/features/settings/schemas";

// Falls back to config/site.config.ts when the settings row is missing or fails validation
// (ARCHITECTURE.md §4.6), so a bad or absent row never breaks the storefront shell.
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
  readSetting("contact", contactSchema, siteConfig.contact),
);

export const getSocialLinks = cache((): Promise<SocialLinks> =>
  readSetting("social_links", socialLinksSchema, siteConfig.socialLinks),
);

export const getBankAccounts = cache((): Promise<BankAccount[]> =>
  readSetting("bank_accounts", bankAccountsSchema, [...siteConfig.bankAccounts]),
);

/** Off by default (empty list) — push is the primary new-order alert (BUILD_PLAN.md C26). */
export const getNotifyOwnerOrderEmails = cache((): Promise<NotifyRecipients> =>
  readSetting("notify_owner_order_emails", notifyRecipientsSchema, []),
);

/** On by default once S17 adds a real inquiry form; the key itself seeds empty (owner decision). */
export const getNotifyOwnerWholesaleEmails = cache((): Promise<NotifyRecipients> =>
  readSetting("notify_owner_wholesale_emails", notifyRecipientsSchema, []),
);
