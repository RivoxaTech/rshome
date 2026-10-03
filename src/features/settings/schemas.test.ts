import { describe, expect, it } from "vitest";
import {
  MAX_BANK_ACCOUNTS,
  MAX_NOTIFY_RECIPIENTS,
  bankAccountFieldName,
  bankAccountsFromForm,
  bankSettingsInputSchema,
  contactInputSchema,
  recipientListSchema,
  storeSettingsInputSchema,
} from "./schemas";

const account = (overrides: Record<string, string> = {}) => ({
  bankName: " Meezan Bank ",
  accountTitle: "RS Home",
  accountNumber: "0123-4567890-1",
  iban: "PK36 MEZN 0001 2345 6789 0123",
  note: "",
  ...overrides,
});

const bankInput = (overrides: Record<string, unknown> = {}) => ({
  phone: "0321 8581969",
  whatsapp: "+92 321 8581969",
  address: "Shop 2, DHA Phase 6, Karachi",
  accounts: [account()],
  version: "bank_accounts@1|contact@2",
  ...overrides,
});

describe("contactInputSchema", () => {
  it("keeps the display phone as typed but stores the WhatsApp number normalised to digits", () => {
    const parsed = contactInputSchema.parse({ phone: " 0321 8581969 ", whatsapp: "0321-8581969", address: " DHA " });
    expect(parsed).toEqual({ phone: "0321 8581969", whatsapp: "923218581969", address: "DHA" });
  });

  it("accepts an international WhatsApp number with its country code and refuses one without", () => {
    expect(contactInputSchema.parse({ phone: "+44 20 7946 0958", whatsapp: "+44 7700 900123", address: "London" }).whatsapp).toBe("447700900123");
    const refused = contactInputSchema.safeParse({ phone: "0321 8581969", whatsapp: "020 7946 0958", address: "x" });
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.issues[0].path).toEqual(["whatsapp"]);
  });

  it("refuses a blank phone, a non-numeric WhatsApp value and an over-long address", () => {
    expect(contactInputSchema.safeParse({ phone: "", whatsapp: "923218581969", address: "x" }).success).toBe(false);
    expect(contactInputSchema.safeParse({ phone: "0321 8581969", whatsapp: "call me", address: "x" }).success).toBe(false);
    expect(contactInputSchema.safeParse({ phone: "0321 8581969", whatsapp: "923218581969", address: "a".repeat(301) }).success).toBe(false);
  });
});

describe("bankSettingsInputSchema", () => {
  it("trims every field, stores a blank IBAN and note as null, and keeps real-looking numbers", () => {
    const parsed = bankSettingsInputSchema.parse(bankInput({ accounts: [account({ iban: "  ", note: " Use for PKR transfers " })] }));
    expect(parsed.accounts).toEqual([{ bankName: "Meezan Bank", accountTitle: "RS Home", accountNumber: "0123-4567890-1", iban: null, note: "Use for PKR transfers" }]);
    expect(parsed.whatsapp).toBe("923218581969");
    expect(parsed.version).toBe("bank_accounts@1|contact@2");
  });

  it("accepts letters, digits, spaces and dashes in an account number or IBAN but nothing else", () => {
    expect(bankSettingsInputSchema.safeParse(bankInput({ accounts: [account({ accountNumber: "PK36MEZN 0001-2345" })] })).success).toBe(true);
    const refused = bankSettingsInputSchema.safeParse(bankInput({ accounts: [account({ accountNumber: "0123/4567" })] }));
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.issues[0].path).toEqual(["accounts", 0, "accountNumber"]);
    expect(bankSettingsInputSchema.safeParse(bankInput({ accounts: [account({ iban: "PK36<script>" })] })).success).toBe(false);
  });

  it("needs at least one account and at most the maximum", () => {
    expect(bankSettingsInputSchema.safeParse(bankInput({ accounts: [] })).success).toBe(false);
    expect(bankSettingsInputSchema.safeParse(bankInput({ accounts: Array.from({ length: MAX_BANK_ACCOUNTS + 1 }, () => account()) })).success).toBe(false);
    expect(bankSettingsInputSchema.safeParse(bankInput({ accounts: Array.from({ length: MAX_BANK_ACCOUNTS }, () => account()) })).success).toBe(true);
  });

  it("refuses a blank bank name or title with a field-level issue", () => {
    const refused = bankSettingsInputSchema.safeParse(bankInput({ accounts: [account({ bankName: "  " })] }));
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.issues[0].path).toEqual(["accounts", 0, "bankName"]);
  });
});

describe("bankAccountsFromForm", () => {
  it("reads the indexed fields the bank page posts, in order, up to accountCount", () => {
    const entries = {
      accountCount: "2",
      [bankAccountFieldName(0, "BankName")]: "Meezan",
      [bankAccountFieldName(0, "Title")]: "RS Home",
      [bankAccountFieldName(0, "Number")]: "1",
      [bankAccountFieldName(0, "Iban")]: "",
      [bankAccountFieldName(0, "Note")]: "",
      [bankAccountFieldName(1, "BankName")]: "HBL",
      [bankAccountFieldName(1, "Title")]: "RS Home",
      [bankAccountFieldName(1, "Number")]: "2",
      [bankAccountFieldName(1, "Iban")]: "PK1",
      [bankAccountFieldName(1, "Note")]: "Intl",
      [bankAccountFieldName(2, "BankName")]: "ignored",
    };
    expect(bankAccountsFromForm(entries)).toEqual([
      { bankName: "Meezan", accountTitle: "RS Home", accountNumber: "1", iban: "", note: "" },
      { bankName: "HBL", accountTitle: "RS Home", accountNumber: "2", iban: "PK1", note: "Intl" },
    ]);
  });

  it("yields nothing for a missing or nonsense count", () => {
    expect(bankAccountsFromForm({})).toEqual([]);
    expect(bankAccountsFromForm({ accountCount: "lots" })).toEqual([]);
    expect(bankAccountsFromForm({ accountCount: "-1" })).toEqual([]);
  });
});

describe("storeSettingsInputSchema", () => {
  const valid = {
    storeName: " RS Home ",
    logoText: "RS Home",
    announcementText: " Free delivery this week ",
    facebook: "https://www.facebook.com/rshome",
    instagram: "",
    instagramHandle: "@rshome",
    orderEmails: "",
    wholesaleEmails: "",
    version: "",
  };

  it("trims text and accepts a blank social link or announcement", () => {
    const parsed = storeSettingsInputSchema.parse(valid);
    expect(parsed.storeName).toBe("RS Home");
    expect(parsed.announcementText).toBe("Free delivery this week");
    expect(parsed.instagram).toBe("");
    expect(storeSettingsInputSchema.parse({ ...valid, announcementText: "   " }).announcementText).toBe("");
  });

  it("refuses a non-https or relative social link", () => {
    for (const bad of ["http://facebook.com/x", "javascript:alert(1)", "/relative", "www.facebook.com/x", "https://bad link"]) {
      const refused = storeSettingsInputSchema.safeParse({ ...valid, facebook: bad });
      expect(refused.success, bad).toBe(false);
      if (!refused.success) expect(refused.error.issues[0].path).toEqual(["facebook"]);
    }
  });

  it("refuses HTML in the announcement or handle and an over-long announcement", () => {
    expect(storeSettingsInputSchema.safeParse({ ...valid, announcementText: "<b>Sale</b>" }).success).toBe(false);
    expect(storeSettingsInputSchema.safeParse({ ...valid, instagramHandle: "<img>" }).success).toBe(false);
    expect(storeSettingsInputSchema.safeParse({ ...valid, announcementText: "a".repeat(121) }).success).toBe(false);
    expect(storeSettingsInputSchema.safeParse({ ...valid, announcementText: "a".repeat(120) }).success).toBe(true);
  });

  it("requires a store name and logo text within their limits", () => {
    expect(storeSettingsInputSchema.safeParse({ ...valid, storeName: " " }).success).toBe(false);
    expect(storeSettingsInputSchema.safeParse({ ...valid, logoText: "a".repeat(41) }).success).toBe(false);
  });
});

describe("recipientListSchema", () => {
  it("splits on commas, semicolons, spaces and newlines, lower-cases and de-duplicates", () => {
    expect(recipientListSchema.parse("Owner@RSHome.pk, second@x.com;owner@rshome.pk\n third@x.com ")).toEqual(["owner@rshome.pk", "second@x.com", "third@x.com"]);
  });

  it("accepts an empty list (no email alerts) and refuses a bad address, naming it", () => {
    expect(recipientListSchema.parse("")).toEqual([]);
    expect(recipientListSchema.parse("  ,  ")).toEqual([]);
    const refused = recipientListSchema.safeParse("owner@rshome.pk, not-an-email");
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.issues[0].message).toContain("not-an-email");
  });

  it("caps the list", () => {
    const many = Array.from({ length: MAX_NOTIFY_RECIPIENTS + 1 }, (_, i) => `owner${i}@x.com`).join(",");
    expect(recipientListSchema.safeParse(many).success).toBe(false);
    expect(recipientListSchema.safeParse(many.split(",").slice(0, MAX_NOTIFY_RECIPIENTS).join(",")).success).toBe(true);
  });
});
