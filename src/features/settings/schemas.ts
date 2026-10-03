import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

// Shapes for the `settings` table's JSON-in-TEXT values (DATABASE.md DB2: no JSON columns). Each
// stored shape has a `*Schema` for reading rows and, since S14, a `*InputSchema` for the panel
// form that writes it (trimmed, length-limited, normalised at the boundary).

/** Blank, or a trimmed string of at most `max` characters. */
const optionalText = (max: number, message?: string) => z.string().trim().max(max, message ?? `Keep this under ${max} characters.`).default("");

// ── Contact (Admin, settings.bank) ──────────────────────────────────────────────────────────────

export const contactSchema = z.object({
  phone: z.string().min(1),
  whatsapp: z.string().min(1),
  address: z.string().min(1),
});
export type Contact = z.infer<typeof contactSchema>;

/** A phone the customer can dial, kept as typed (the footer shows it verbatim) once `normalizePhone` accepts it. */
const displayPhoneField = z
  .string()
  .trim()
  .min(1, "Enter the shop's phone number.")
  .max(32, "Keep this under 32 characters.")
  .refine((value) => normalizePhone(value) !== null, "Enter a valid phone number, with the country code outside Pakistan.");

/** The WhatsApp number is stored normalised — digits with the country code — since it goes straight into `wa.me/` links. */
const whatsappField = z
  .string()
  .trim()
  .min(1, "Enter the shop's WhatsApp number.")
  .max(32, "Keep this under 32 characters.")
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (normalized === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid WhatsApp number, with the country code outside Pakistan." });
      return z.NEVER;
    }
    return normalized;
  });

export const contactInputSchema = z.object({
  phone: displayPhoneField,
  whatsapp: whatsappField,
  address: z.string().trim().min(1, "Enter the shop's address.").max(300, "Keep the address under 300 characters."),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

// ── Bank accounts (Admin, settings.bank) ────────────────────────────────────────────────────────

/** Shown to bank-transfer customers at checkout and on the order page. `iban` matters for international payers. */
export const bankAccountSchema = z.object({
  bankName: z.string().min(1),
  accountTitle: z.string().min(1),
  accountNumber: z.string().min(1),
  iban: z.string().min(1).nullable().default(null),
  note: z.string().min(1).nullable().default(null),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

export const bankAccountsSchema = z.array(bankAccountSchema).min(1);

export const MAX_BANK_ACCOUNTS = 5;

/** Letters, digits, spaces and dashes only — loose on purpose: a real account number or IBAN is never refused for its shape. */
const ACCOUNT_SHAPE = /^[A-Za-z0-9 -]+$/;
const ACCOUNT_SHAPE_MESSAGE = "Use letters, numbers, spaces and dashes only.";

const accountNumberField = z
  .string()
  .trim()
  .min(1, "Enter the account number.")
  .max(40, "Keep this under 40 characters.")
  .regex(ACCOUNT_SHAPE, ACCOUNT_SHAPE_MESSAGE);

/** `""` -> `null`, so an optional field is stored as NULL rather than an empty string. */
const optionalTrimmed = (max: number, pattern?: RegExp) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    (pattern ? z.string().trim().max(max, `Keep this under ${max} characters.`).regex(pattern, ACCOUNT_SHAPE_MESSAGE) : z.string().trim().max(max, `Keep this under ${max} characters.`)).nullable(),
  );

export const bankAccountInputSchema = z.object({
  bankName: z.string().trim().min(1, "Enter the bank's name.").max(80, "Keep this under 80 characters."),
  accountTitle: z.string().trim().min(1, "Enter the account title.").max(120, "Keep this under 120 characters."),
  accountNumber: accountNumberField,
  iban: optionalTrimmed(40, ACCOUNT_SHAPE),
  note: optionalTrimmed(200),
});

/**
 * The bank page posts its accounts as indexed fields — `account0BankName`, `account0Title`,
 * `account0Number`, `account0Iban`, `account0Note`, then `account1…` — plus `accountCount`. Read
 * from the flat form entries here so the Server Action's wire format is literal and testable.
 */
export const BANK_ACCOUNT_FIELDS = ["BankName", "Title", "Number", "Iban", "Note"] as const;
export function bankAccountFieldName(index: number, field: (typeof BANK_ACCOUNT_FIELDS)[number]): string {
  return `account${index}${field}`;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Pulls the indexed account fields out of a flat `Object.fromEntries(formData)` record. */
export function bankAccountsFromForm(entries: Record<string, unknown>): unknown[] {
  const count = Number(entries.accountCount);
  if (!Number.isInteger(count) || count < 0) return [];
  return Array.from({ length: Math.min(count, MAX_BANK_ACCOUNTS + 1) }, (_, index) => ({
    bankName: text(entries[bankAccountFieldName(index, "BankName")]),
    accountTitle: text(entries[bankAccountFieldName(index, "Title")]),
    accountNumber: text(entries[bankAccountFieldName(index, "Number")]),
    iban: text(entries[bankAccountFieldName(index, "Iban")]),
    note: text(entries[bankAccountFieldName(index, "Note")]),
  }));
}

export const bankAccountsInputSchema = z
  .array(bankAccountInputSchema)
  .min(1, "Add at least one bank account.")
  .max(MAX_BANK_ACCOUNTS, `Keep to ${MAX_BANK_ACCOUNTS} bank accounts or fewer.`);

/** The whole Admin page (`/panel/settings/bank`): accounts, contact, and the concurrency token. */
export const bankSettingsInputSchema = contactInputSchema.extend({
  accounts: bankAccountsInputSchema,
  version: z.string().max(1000).default(""),
});
export type BankSettingsInput = z.infer<typeof bankSettingsInputSchema>;

// ── Store identity, announcement, social links (Developer, settings.manage) ─────────────────────

export const storeIdentitySchema = z.object({
  storeName: z.string().min(1),
  logoText: z.string().min(1),
});
export type StoreIdentity = z.infer<typeof storeIdentitySchema>;

/** A plain string; blank hides the bar (rendered as text, never HTML). */
export const announcementTextSchema = z.string();

export const socialLinksSchema = z.object({
  facebook: z.string(),
  instagram: z.string(),
  instagramHandle: z.string(),
});
export type SocialLinks = z.infer<typeof socialLinksSchema>;

/** Blank, or an absolute `https://` URL — a storefront link is never `javascript:` or a relative path. */
const httpsUrlField = optionalText(300).refine((value) => value === "" || /^https:\/\/[^\s]+$/.test(value), "Enter a full https:// link, or leave it blank.");

const NO_HTML = /^[^<>]*$/;

export const storeSettingsInputSchema = z.object({
  storeName: z.string().trim().min(1, "Enter the store's name.").max(60, "Keep this under 60 characters."),
  logoText: z.string().trim().min(1, "Enter the logo text.").max(40, "Keep this under 40 characters."),
  announcementText: optionalText(120, "Keep the announcement under 120 characters.").refine((value) => NO_HTML.test(value), "Plain text only — no < or > characters."),
  facebook: httpsUrlField,
  instagram: httpsUrlField,
  instagramHandle: optionalText(50).refine((value) => NO_HTML.test(value), "Plain text only — no < or > characters."),
  orderEmails: z.string().max(2000).default(""),
  wholesaleEmails: z.string().max(2000).default(""),
  version: z.string().max(1000).default(""),
});
export type StoreSettingsInput = z.infer<typeof storeSettingsInputSchema>;

// ── Owner alert recipients (Developer, settings.manage) ─────────────────────────────────────────

/**
 * Owner alert recipients (S21 Phase 2): `notify_owner_order_emails` (off by default — push is the
 * primary alert) and `notify_owner_wholesale_emails`. Empty means "no email alerts" for that
 * event (owner decision C26).
 */
export const notifyRecipientsSchema = z.array(z.email()).default([]);
export type NotifyRecipients = z.infer<typeof notifyRecipientsSchema>;

export const MAX_NOTIFY_RECIPIENTS = 10;

/**
 * The chips editor posts ONE field with the addresses separated by commas, semicolons, spaces or
 * newlines. Lower-cased and de-duplicated here, so `Owner@x.com` and `owner@x.com` are one entry.
 */
export const recipientListSchema = z.string().transform((raw, ctx) => {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const token of raw.split(/[\s,;]+/)) {
    const email = token.trim().toLowerCase();
    if (!email) continue;
    if (!z.email().safeParse(email).success) {
      ctx.addIssue({ code: "custom", message: `"${token.trim()}" isn't a valid email address.` });
      return z.NEVER;
    }
    if (!seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }
  if (emails.length > MAX_NOTIFY_RECIPIENTS) {
    ctx.addIssue({ code: "custom", message: `Keep to ${MAX_NOTIFY_RECIPIENTS} addresses or fewer.` });
    return z.NEVER;
  }
  return emails;
});

export const NOTIFY_LISTS = ["order", "wholesale"] as const;
export type NotifyList = (typeof NOTIFY_LISTS)[number];
export const notifyListSchema = z.enum(NOTIFY_LISTS);
