/**
 * The panel's settings editors (S14, REQUIREMENTS DV-07): the Admin's bank/contact page
 * (`settings.bank`) and the Developer's store page (`settings.manage`). Every save validates with
 * Zod at the boundary, locks the rows it touches (`SELECT … FOR UPDATE`, one transaction), refuses
 * a stale edit through the `version` token, writes the changed keys and one `audit_logs` row per
 * changed key with old/new values — bank account numbers masked (`audit-mask.ts`). Refusals come
 * back as `{ ok: false }`, never a throw. `service.ts` stays the storefront's read path.
 */
import type { ZodError } from "zod";
import { insertAuditLog } from "@/features/audit/repo";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { loadStore } from "@/features/mail/service";
import { buildTestEmail } from "@/features/mail/templates";
import { fingerprint } from "@/lib/fingerprint";
import { db } from "@/server/db/client";
import { isMailConfigured, sendMail } from "@/server/mail/transport";
import { maskBankAccountsForAudit } from "./audit-mask";
import { getSettingRows, lockSettingRows, upsertSetting, type SettingRow } from "./repo";
import {
  BANK_ACCOUNT_FIELDS,
  type BankAccount,
  type Contact,
  type NotifyList,
  type NotifyRecipients,
  type SocialLinks,
  type StoreIdentity,
  bankAccountFieldName,
  bankAccountsFromForm,
  bankSettingsInputSchema,
  recipientListSchema,
  storeSettingsInputSchema,
} from "./schemas";
import {
  SETTING_KEYS,
  getAnnouncementText,
  getBankAccounts,
  getContactInfo,
  getNotifyOwnerOrderEmails,
  getNotifyOwnerWholesaleEmails,
  getSocialLinks,
  getStoreIdentity,
} from "./service";
import { invalidInput } from "@/features/shared/staff-result";

export type { StaffActionResult };

type Actor = { id: number; name: string };

export const STALE_EDIT_MESSAGE = "Someone else saved these settings after you opened this page. Reload to see their changes, then make yours again.";

const AUDIT_ACTION = "settings.update";

/**
 * The optimistic-concurrency token for a set of keys (pure): each existing row's `updated_at` and
 * a fingerprint of its value, sorted by key. Posted back by the form as `version`; compared under
 * the row lock before saving. The fingerprint matters because `updated_at` has whole-second
 * precision: without it two saves inside one second would look identical.
 */
export function settingsVersion(rows: readonly Pick<SettingRow, "key" | "updatedAt" | "value">[]): string {
  return [...rows]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => `${row.key}@${row.updatedAt.getTime()}@${fingerprint(row.value)}`)
    .join("|");
}

// ── Admin: bank accounts and contact (`/panel/settings/bank`) ───────────────────────────────────

const BANK_KEYS = [SETTING_KEYS.bankAccounts, SETTING_KEYS.contact] as const;

type BankSettingsFormData = { accounts: BankAccount[]; contact: Contact; version: string };

export async function getBankSettingsForEdit(): Promise<BankSettingsFormData> {
  const [accounts, contact, rows] = await Promise.all([getBankAccounts(), getContactInfo(), getSettingRows(BANK_KEYS)]);
  return { accounts, contact, version: settingsVersion(rows) };
}

const ACCOUNT_FIELD_SUFFIX: Record<string, (typeof BANK_ACCOUNT_FIELDS)[number]> = {
  bankName: "BankName",
  accountTitle: "Title",
  accountNumber: "Number",
  iban: "Iban",
  note: "Note",
};

/** An issue at `accounts[i].iban` is reported against the posted field it came from (`account0Iban`), not the array. */
function bankFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const [head, index, leaf] = issue.path;
    const field =
      head === "accounts" && typeof index === "number" && typeof leaf === "string" && leaf in ACCOUNT_FIELD_SUFFIX
        ? bankAccountFieldName(index, ACCOUNT_FIELD_SUFFIX[leaf])
        : String(head ?? "form");
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

/** `rawInput` is `Object.fromEntries(formData)`: the indexed account fields are gathered into `accounts` first. */
export async function saveBankSettings(rawInput: Record<string, unknown>, actor: Actor): Promise<StaffActionResult> {
  const parsed = bankSettingsInputSchema.safeParse({ ...rawInput, accounts: bankAccountsFromForm(rawInput) });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form.", fieldErrors: bankFieldErrors(parsed.error) };
  const input = parsed.data;

  const nextAccounts: BankAccount[] = input.accounts.map((account) => ({
    bankName: account.bankName,
    accountTitle: account.accountTitle,
    accountNumber: account.accountNumber,
    iban: account.iban,
    note: account.note,
  }));
  const nextContact: Contact = { phone: input.phone, whatsapp: input.whatsapp, address: input.address };

  return saveKeys(
    BANK_KEYS,
    input.version,
    [
      { key: SETTING_KEYS.bankAccounts, read: getBankAccounts, next: nextAccounts, forAudit: (value) => maskBankAccountsForAudit(value as BankAccount[]) },
      { key: SETTING_KEYS.contact, read: getContactInfo, next: nextContact },
    ],
    actor,
  );
}

// ── Developer: store identity, announcement, social links, recipients (`/panel/settings`) ───────

const STORE_KEYS = [
  SETTING_KEYS.storeIdentity,
  SETTING_KEYS.announcementText,
  SETTING_KEYS.socialLinks,
  SETTING_KEYS.notifyOwnerOrderEmails,
  SETTING_KEYS.notifyOwnerWholesaleEmails,
] as const;

type StoreSettingsFormData = {
  identity: StoreIdentity;
  announcementText: string;
  socialLinks: SocialLinks;
  orderEmails: NotifyRecipients;
  wholesaleEmails: NotifyRecipients;
  version: string;
  /** Without SMTP (development) a test email is only logged on the server; the page says so up front. */
  mailConfigured: boolean;
};

export async function getStoreSettingsForEdit(): Promise<StoreSettingsFormData> {
  const [identity, announcementText, socialLinks, orderEmails, wholesaleEmails, rows] = await Promise.all([
    getStoreIdentity(),
    getAnnouncementText(),
    getSocialLinks(),
    getNotifyOwnerOrderEmails(),
    getNotifyOwnerWholesaleEmails(),
    getSettingRows(STORE_KEYS),
  ]);
  return { identity, announcementText, socialLinks, orderEmails, wholesaleEmails, version: settingsVersion(rows), mailConfigured: isMailConfigured() };
}

export async function saveStoreSettings(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = storeSettingsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  // The two recipient lists are one posted field each; a bad address is reported against its own field.
  const orderEmails = recipientListSchema.safeParse(input.orderEmails);
  if (!orderEmails.success) return { ok: false, error: orderEmails.error.issues[0].message, fieldErrors: { orderEmails: orderEmails.error.issues[0].message } };
  const wholesaleEmails = recipientListSchema.safeParse(input.wholesaleEmails);
  if (!wholesaleEmails.success) {
    return { ok: false, error: wholesaleEmails.error.issues[0].message, fieldErrors: { wholesaleEmails: wholesaleEmails.error.issues[0].message } };
  }

  return saveKeys(
    STORE_KEYS,
    input.version,
    [
      { key: SETTING_KEYS.storeIdentity, read: getStoreIdentity, next: { storeName: input.storeName, logoText: input.logoText } },
      { key: SETTING_KEYS.announcementText, read: getAnnouncementText, next: input.announcementText },
      { key: SETTING_KEYS.socialLinks, read: getSocialLinks, next: { facebook: input.facebook, instagram: input.instagram, instagramHandle: input.instagramHandle } },
      { key: SETTING_KEYS.notifyOwnerOrderEmails, read: getNotifyOwnerOrderEmails, next: orderEmails.data },
      { key: SETTING_KEYS.notifyOwnerWholesaleEmails, read: getNotifyOwnerWholesaleEmails, next: wholesaleEmails.data },
    ],
    actor,
  );
}

// ── The shared save: lock, version check, write changed keys, audit each ────────────────────────

type KeyWrite<T> = {
  key: string;
  /** The current effective value (the row, or the config fallback) — what "old" means in the audit row. */
  read: () => Promise<T>;
  next: T;
  /** Masks a value before it's written to `audit_logs`; identity when absent. */
  forAudit?: (value: T) => unknown;
};

async function saveKeys(keys: readonly string[], version: string, writes: KeyWrite<unknown>[], actor: Actor): Promise<StaffActionResult> {
  return db.transaction(async (tx) => {
    const locked = await lockSettingRows(tx, keys);
    if (settingsVersion(locked) !== version) return { ok: false, error: STALE_EDIT_MESSAGE };

    const now = new Date();
    for (const write of writes) {
      const current = await write.read();
      if (JSON.stringify(current) === JSON.stringify(write.next)) continue;
      await upsertSetting(tx, write.key, write.next, now);
      const mask = write.forAudit ?? ((value: unknown) => value);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: AUDIT_ACTION,
        entity: "settings",
        entityId: write.key,
        oldValues: { value: mask(current) },
        newValues: { value: mask(write.next) },
        createdAt: now,
      });
    }
    return { ok: true };
  });
}

// ── "Send test email" ───────────────────────────────────────────────────────────────────────────

export type TestEmailResult = { ok: true; message: string } | { ok: false; error: string };

const LIST_LABELS: Record<NotifyList, string> = { order: "order alerts", wholesale: "wholesale inquiry alerts" };

/**
 * Sends a short test message to the *saved* recipient list through the real mail service and
 * reports what happened honestly: the recipients it went to, the transport's own error text, or
 * — without SMTP (development) — that it was only logged on the server.
 */
const TEST_EMAIL_FAILED = "Sending failed. Check the SMTP settings on the server; the mail server's reply is in the server log.";

export async function sendTestEmail(list: NotifyList, actor: Actor): Promise<TestEmailResult> {
  const recipients = list === "order" ? await getNotifyOwnerOrderEmails() : await getNotifyOwnerWholesaleEmails();
  if (recipients.length === 0) return { ok: false, error: `Save at least one address in the ${LIST_LABELS[list]} list first.` };

  const store = await loadStore();
  const content = buildTestEmail({ listLabel: LIST_LABELS[list], sentBy: actor.name, store });
  try {
    await sendMail({ to: recipients.join(","), ...content });
  } catch (error) {
    // The transport's own text stays in the server log (S22 SEC-13); the page gets a fixed line.
    console.error("Test email failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: TEST_EMAIL_FAILED };
  }
  if (!isMailConfigured()) {
    return { ok: true, message: `No SMTP is configured, so nothing was sent — the test email to ${recipients.join(", ")} was only logged on the server (development).` };
  }
  return { ok: true, message: `Test email sent to ${recipients.join(", ")}.` };
}
