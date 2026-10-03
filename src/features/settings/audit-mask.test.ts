import { describe, expect, it } from "vitest";
import { maskBankAccountsForAudit, maskSecret } from "./audit-mask";
import { settingsVersion } from "./staff-service";

describe("maskSecret", () => {
  it("keeps only the last four characters", () => {
    expect(maskSecret("0123-4567890-1")).toBe("••••90-1");
    expect(maskSecret("PK36MEZN00012345678901234")).toBe("••••1234");
  });

  it("masks a short value entirely and passes null through", () => {
    expect(maskSecret("1234")).toBe("••••");
    expect(maskSecret("12")).toBe("••••");
    expect(maskSecret(null)).toBeNull();
  });

  it("ignores surrounding whitespace when picking the tail", () => {
    expect(maskSecret("  987654  ")).toBe("••••7654");
  });
});

describe("maskBankAccountsForAudit", () => {
  it("masks the account number and IBAN of every account and leaves the rest alone", () => {
    const masked = maskBankAccountsForAudit([
      { bankName: "Meezan", accountTitle: "RS Home", accountNumber: "0123456789", iban: "PK36MEZN0001234567890123", note: "PKR" },
      { bankName: "HBL", accountTitle: "RS Home", accountNumber: "555", iban: null, note: null },
    ]);
    expect(masked).toEqual([
      { bankName: "Meezan", accountTitle: "RS Home", accountNumber: "••••6789", iban: "••••0123", note: "PKR" },
      { bankName: "HBL", accountTitle: "RS Home", accountNumber: "••••", iban: null, note: null },
    ]);
    expect(JSON.stringify(masked)).not.toContain("0123456789");
  });
});

describe("settingsVersion", () => {
  it("is independent of row order and changes when any row's updated_at or value moves", () => {
    const a = { key: "contact", updatedAt: new Date(1_000), value: '{"phone":"1"}' };
    const b = { key: "bank_accounts", updatedAt: new Date(2_000), value: "[]" };
    expect(settingsVersion([a, b])).toBe(settingsVersion([b, a]));
    expect(settingsVersion([a, b])).toMatch(/^bank_accounts@2000@[0-9a-f]{12}\|contact@1000@[0-9a-f]{12}$/);
    expect(settingsVersion([a, { ...b, updatedAt: new Date(3_000) }])).not.toBe(settingsVersion([a, b]));
    // Same second, different content (a DATETIME has whole-second precision): still a different token.
    expect(settingsVersion([{ ...a, value: '{"phone":"2"}' }, b])).not.toBe(settingsVersion([a, b]));
  });

  it("is empty when no row exists yet (a fresh database with only the config fallback)", () => {
    expect(settingsVersion([])).toBe("");
  });
});
