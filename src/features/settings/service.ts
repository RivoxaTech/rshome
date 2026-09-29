import { cache } from "react";
import { siteConfig } from "@/config/site.config";
import { getSettingValue } from "@/features/settings/repo";
import { type Contact, type SocialLinks, contactSchema, socialLinksSchema } from "@/features/settings/schemas";

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
