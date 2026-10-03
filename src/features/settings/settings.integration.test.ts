/**
 * The two settings pages against the test database (S14): the real Server Actions with the
 * literal field names the forms post, old/new audit rows with account numbers masked, the
 * stale-edit refusal, boundary Zod refusals as `{ ok: false }`, the storefront readers seeing a
 * change on the next read and falling back to config with no rows, the owner-alert code using a
 * changed recipient list, the honest test-email result, and the Admin-vs-Developer RBAC wall both
 * ways. `next/headers`, the mail transport and push are mocked as in the other panel suites.
 * Skips without TEST_DATABASE_URL.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/config/site.config";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { settings } from "@/server/db/schema/settings";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const sendMail = vi.hoisted(() => vi.fn());
const isMailConfigured = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/server/mail/transport", () => ({ sendMail, isMailConfigured }));
vi.mock("@/server/notify/push", () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }) }));

type Db = typeof import("@/server/db/client");
type Actions = typeof import("@/app/panel/(protected)/settings/actions");

/** A thrown `redirect()` error's digest looks like `NEXT_REDIRECT;replace;/panel/403;307;`. */
async function expectRedirectTo(run: () => Promise<unknown>, path: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    expect(digest, `expected a redirect, got ${String(error)}`).toContain(`;${path};`);
    return;
  }
  throw new Error(`expected a redirect to ${path}, but nothing was thrown`);
}

const FULL_ACCOUNT_NUMBER = "0123-4567890-1";
const FULL_IBAN = "PK36MEZN0001234567890123";

describe.skipIf(!TEST_DATABASE_URL)("settings pages (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let actions: Actions;
  let readers: typeof import("./service");
  let staff: typeof import("./staff-service");
  let BankSettingsPage: (typeof import("@/app/panel/(protected)/settings/bank/page"))["default"];
  let SettingsPage: (typeof import("@/app/panel/(protected)/settings/page"))["default"];
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let notifyNewOrder: typeof import("@/features/notify/service").notifyNewOrder;
  let loadStore: typeof import("@/features/mail/service").loadStore;

  let ids: FixtureIds;
  let ipCounter = 0;
  const nextIp = () => `settings-ip-${++ipCounter}`;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  /** Exactly the fields `BankSettingsForm` posts. */
  const bankFields = (version: string, overrides: Record<string, string | number> = {}) => ({
    version,
    accountCount: "1",
    account0BankName: "Meezan Bank",
    account0Title: "RS Home",
    account0Number: FULL_ACCOUNT_NUMBER,
    account0Iban: FULL_IBAN,
    account0Note: "",
    phone: "0321 9990000",
    whatsapp: "+92 321 999 0000",
    address: "Shop 9, Zamzama, Karachi",
    ...overrides,
  });

  /** Exactly the fields `StoreSettingsForm` posts. */
  const storeFields = (version: string, overrides: Record<string, string | number> = {}) => ({
    version,
    storeName: "Reema Home",
    logoText: "Reema",
    announcementText: "Free delivery in Karachi this week",
    facebook: "https://www.facebook.com/reemahome",
    instagram: "",
    instagramHandle: "",
    orderEmails: "Owner@ReemaHome.pk, owner@reemahome.pk, second@reemahome.pk",
    wholesaleEmails: "",
    ...overrides,
  });

  const auditRows = (entityId: string) => db.select().from(auditLogs).where(and(eq(auditLogs.entity, "settings"), eq(auditLogs.entityId, entityId)));

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    actions = await import("@/app/panel/(protected)/settings/actions");
    readers = await import("./service");
    staff = await import("./staff-service");
    ({ default: BankSettingsPage } = await import("@/app/panel/(protected)/settings/bank/page"));
    ({ default: SettingsPage } = await import("@/app/panel/(protected)/settings/page"));
    ({ createOrder } = await import("@/features/checkout/service"));
    ({ notifyNewOrder } = await import("@/features/notify/service"));
    ({ loadStore } = await import("@/features/mail/service"));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    sendMail.mockReset();
    sendMail.mockResolvedValue(undefined);
    isMailConfigured.mockReset();
    isMailConfigured.mockReturnValue(false);
    await resetTables(db);
    ids = await seedFixtures(db);
  });

  describe("with no settings rows at all", () => {
    it("every reader falls back to config/site.config.ts and the version token is empty", async () => {
      expect(await readers.getContactInfo()).toEqual(siteConfig.contact);
      expect(await readers.getSocialLinks()).toEqual(siteConfig.socialLinks);
      expect(await readers.getBankAccounts()).toEqual(siteConfig.bankAccounts);
      expect(await readers.getStoreIdentity()).toEqual({ storeName: siteConfig.storeName, logoText: siteConfig.logoText });
      expect(await readers.getAnnouncementText()).toBe(siteConfig.announcementText);
      expect(await readers.getNotifyOwnerOrderEmails()).toEqual([]);
      expect((await staff.getBankSettingsForEdit()).version).toBe("");
      expect((await staff.getStoreSettingsForEdit()).version).toBe("");
    });

    it("an unreadable row also falls back rather than breaking the storefront", async () => {
      await db.insert(settings).values({ key: "store_identity", value: "{not json" });
      expect(await readers.getStoreIdentity()).toEqual({ storeName: siteConfig.storeName, logoText: siteConfig.logoText });
      await db.update(settings).set({ value: JSON.stringify({ storeName: "" }) }).where(eq(settings.key, "store_identity"));
      expect(await readers.getStoreIdentity()).toEqual({ storeName: siteConfig.storeName, logoText: siteConfig.logoText });
    });
  });

  describe("Admin: bank & contact (settings.bank)", () => {
    beforeEach(() => signInAs(ADMIN_DEFAULT_PERMISSIONS));

    it("saves through the real action with the form's literal field names, and the storefront readers see it on the next read", async () => {
      const { version } = await staff.getBankSettingsForEdit();
      const result = await actions.saveBankSettingsAction(null, form(bankFields(version)));
      expect(result).toEqual({ ok: true });

      expect(await readers.getBankAccounts()).toEqual([{ bankName: "Meezan Bank", accountTitle: "RS Home", accountNumber: FULL_ACCOUNT_NUMBER, iban: FULL_IBAN, note: null }]);
      expect(await readers.getContactInfo()).toEqual({ phone: "0321 9990000", whatsapp: "923219990000", address: "Shop 9, Zamzama, Karachi" });
      // What the emails and WhatsApp messages read.
      expect(await loadStore()).toMatchObject({ phone: "0321 9990000", whatsapp: "923219990000", address: "Shop 9, Zamzama, Karachi" });
    });

    it("writes one audit row per changed key with old/new values, account numbers and IBANs masked to the last four", async () => {
      const { version } = await staff.getBankSettingsForEdit();
      await actions.saveBankSettingsAction(null, form(bankFields(version)));

      const [bank] = await auditRows("bank_accounts");
      expect(bank.action).toBe("settings.update");
      expect(JSON.parse(bank.oldValues!)).toEqual({ value: siteConfig.bankAccounts.map((a) => ({ ...a, accountNumber: expect.stringMatching(/^••••/), iban: expect.stringMatching(/^••••/) })) });
      expect(JSON.parse(bank.newValues!)).toEqual({ value: [{ bankName: "Meezan Bank", accountTitle: "RS Home", accountNumber: "••••90-1", iban: "••••0123", note: null }] });

      const [contact] = await auditRows("contact");
      expect(JSON.parse(contact.oldValues!)).toEqual({ value: siteConfig.contact });
      expect(JSON.parse(contact.newValues!)).toEqual({ value: { phone: "0321 9990000", whatsapp: "923219990000", address: "Shop 9, Zamzama, Karachi" } });

      // Nowhere in the audit log, in either column, does the full number or IBAN appear.
      const everything = JSON.stringify(await db.select().from(auditLogs));
      expect(everything).not.toContain(FULL_ACCOUNT_NUMBER);
      expect(everything).not.toContain(FULL_IBAN);
    });

    it("writes no audit row for a key whose value didn't change", async () => {
      const { version } = await staff.getBankSettingsForEdit();
      await actions.saveBankSettingsAction(null, form(bankFields(version)));
      const next = (await staff.getBankSettingsForEdit()).version;
      // Same accounts, new phone only.
      await actions.saveBankSettingsAction(null, form(bankFields(next, { phone: "0321 1110000" })));
      expect(await auditRows("bank_accounts")).toHaveLength(1);
      expect(await auditRows("contact")).toHaveLength(2);
    });

    it("refuses a stale edit from a second tab with a clear message, and accepts the fresh version", async () => {
      const { version } = await staff.getBankSettingsForEdit();
      // Tab A saves.
      expect(await actions.saveBankSettingsAction(null, form(bankFields(version)))).toEqual({ ok: true });
      // Tab B, opened before A's save, tries with the old token.
      const stale = await actions.saveBankSettingsAction(null, form(bankFields(version, { phone: "0321 2220000" })));
      expect(stale).toEqual({ ok: false, error: staff.STALE_EDIT_MESSAGE });
      expect((await readers.getContactInfo()).phone).toBe("0321 9990000");
      // After reloading, B's save goes through.
      const fresh = (await staff.getBankSettingsForEdit()).version;
      expect(fresh).not.toBe(version);
      expect(await actions.saveBankSettingsAction(null, form(bankFields(fresh, { phone: "0321 2220000" })))).toEqual({ ok: true });
      expect((await readers.getContactInfo()).phone).toBe("0321 2220000");
    });

    it("returns { ok: false } with field errors for a bad WhatsApp number, a bad account number and no accounts, writing nothing", async () => {
      const { version } = await staff.getBankSettingsForEdit();
      const whatsapp = await actions.saveBankSettingsAction(null, form(bankFields(version, { whatsapp: "call the shop" })));
      expect(whatsapp.ok).toBe(false);
      if (!whatsapp.ok) expect(whatsapp.fieldErrors).toHaveProperty("whatsapp");

      const number = await actions.saveBankSettingsAction(null, form(bankFields(version, { account0Number: "0123/4567" })));
      expect(number.ok).toBe(false);
      if (!number.ok) expect(number.fieldErrors).toHaveProperty("account0Number");

      const none = await actions.saveBankSettingsAction(null, form(bankFields(version, { accountCount: "0" })));
      expect(none.ok).toBe(false);
      if (!none.ok) expect(none.fieldErrors).toHaveProperty("accounts");

      expect(await db.select().from(settings)).toHaveLength(0);
      expect(await db.select().from(auditLogs)).toHaveLength(0);
    });

    it("can open its own page but is refused on the Developer's page and action", async () => {
      await expect(BankSettingsPage()).resolves.toBeDefined();
      await expectRedirectTo(() => SettingsPage(), "/panel/403");
      await expectRedirectTo(() => actions.saveStoreSettingsAction(null, form(storeFields(""))), "/panel/403");
      await expectRedirectTo(() => actions.sendTestEmailAction(null, form({ list: "order" })), "/panel/403");
    });
  });

  describe("Developer: store settings (settings.manage)", () => {
    beforeEach(() => signInAs(DEVELOPER_DEFAULT_PERMISSIONS));

    it("saves identity, announcement, social links and both recipient lists, de-duplicating addresses", async () => {
      const { version } = await staff.getStoreSettingsForEdit();
      expect(await actions.saveStoreSettingsAction(null, form(storeFields(version)))).toEqual({ ok: true });

      expect(await readers.getStoreIdentity()).toEqual({ storeName: "Reema Home", logoText: "Reema" });
      expect(await readers.getAnnouncementText()).toBe("Free delivery in Karachi this week");
      expect(await readers.getSocialLinks()).toEqual({ facebook: "https://www.facebook.com/reemahome", instagram: "", instagramHandle: "" });
      expect(await readers.getNotifyOwnerOrderEmails()).toEqual(["owner@reemahome.pk", "second@reemahome.pk"]);
      expect(await readers.getNotifyOwnerWholesaleEmails()).toEqual([]);
      expect((await loadStore()).name).toBe("Reema Home");
    });

    it("a blank announcement is stored as an empty string (the bar hides), and only changed keys get an audit row", async () => {
      const { version } = await staff.getStoreSettingsForEdit();
      await actions.saveStoreSettingsAction(null, form(storeFields(version, { announcementText: "   ", wholesaleEmails: "" })));
      expect(await readers.getAnnouncementText()).toBe("");

      const [announcement] = await auditRows("announcement_text");
      expect(JSON.parse(announcement.oldValues!)).toEqual({ value: siteConfig.announcementText });
      expect(JSON.parse(announcement.newValues!)).toEqual({ value: "" });
      const [identity] = await auditRows("store_identity");
      expect(JSON.parse(identity.newValues!)).toEqual({ value: { storeName: "Reema Home", logoText: "Reema" } });
      // The wholesale list stayed empty: no row for it.
      expect(await auditRows("notify_owner_wholesale_emails")).toHaveLength(0);
      expect(await auditRows("notify_owner_order_emails")).toHaveLength(1);
    });

    it("refuses a stale edit, a non-https link, HTML in the announcement and a bad email as { ok: false }", async () => {
      const { version } = await staff.getStoreSettingsForEdit();
      expect(await actions.saveStoreSettingsAction(null, form(storeFields(version)))).toEqual({ ok: true });
      expect(await actions.saveStoreSettingsAction(null, form(storeFields(version, { storeName: "Other" })))).toEqual({ ok: false, error: staff.STALE_EDIT_MESSAGE });

      const fresh = (await staff.getStoreSettingsForEdit()).version;
      const link = await actions.saveStoreSettingsAction(null, form(storeFields(fresh, { facebook: "http://facebook.com/x" })));
      expect(link.ok).toBe(false);
      if (!link.ok) expect(link.fieldErrors).toHaveProperty("facebook");
      const html = await actions.saveStoreSettingsAction(null, form(storeFields(fresh, { announcementText: "<b>Sale</b>" })));
      expect(html.ok).toBe(false);
      if (!html.ok) expect(html.fieldErrors).toHaveProperty("announcementText");
      const email = await actions.saveStoreSettingsAction(null, form(storeFields(fresh, { orderEmails: "owner@x.com, nope" })));
      expect(email.ok).toBe(false);
      if (!email.ok) expect(email.fieldErrors).toHaveProperty("orderEmails");
      expect((await readers.getStoreIdentity()).storeName).toBe("Reema Home");
    });

    it("the order-alert code uses the changed recipient list on the very next order", async () => {
      const { version } = await staff.getStoreSettingsForEdit();
      await actions.saveStoreSettingsAction(null, form(storeFields(version)));

      const placed = await createOrder(checkoutInput(ids, { paymentMethod: "cod" }), { ip: nextIp() });
      if (!placed.ok) throw new Error(placed.error);
      await notifyNewOrder(placed.orderNumber, "cod");

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].to).toBe("owner@reemahome.pk,second@reemahome.pk");
      // The store name in the alert is the one just saved.
      expect(sendMail.mock.calls[0][0].html).toContain("Reema Home");

      // Clearing the list switches the email alert off again.
      sendMail.mockClear();
      const fresh = (await staff.getStoreSettingsForEdit()).version;
      await actions.saveStoreSettingsAction(null, form(storeFields(fresh, { orderEmails: "" })));
      await notifyNewOrder(placed.orderNumber, "cod");
      expect(sendMail).not.toHaveBeenCalled();
    });

    it("sends a test email to the saved list and reports honestly: logged-only without SMTP, sent with it, the transport's error, or an empty list", async () => {
      const empty = await actions.sendTestEmailAction(null, form({ list: "order" }));
      expect(empty.ok).toBe(false);
      expect(sendMail).not.toHaveBeenCalled();

      const { version } = await staff.getStoreSettingsForEdit();
      await actions.saveStoreSettingsAction(null, form(storeFields(version)));

      const logged = await actions.sendTestEmailAction(null, form({ list: "order" }));
      expect(logged.ok).toBe(true);
      if (logged.ok) expect(logged.message).toMatch(/No SMTP is configured/);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "owner@reemahome.pk,second@reemahome.pk", subject: expect.stringContaining("Test email") });

      isMailConfigured.mockReturnValue(true);
      const sent = await actions.sendTestEmailAction(null, form({ list: "order" }));
      expect(sent).toEqual({ ok: true, message: "Test email sent to owner@reemahome.pk, second@reemahome.pk." });

      sendMail.mockRejectedValueOnce(new Error("535 Authentication failed"));
      const failed = await actions.sendTestEmailAction(null, form({ list: "order" }));
      expect(failed).toEqual({ ok: false, error: "Sending failed: 535 Authentication failed" });

      expect(await actions.sendTestEmailAction(null, form({ list: "nonsense" }))).toEqual({ ok: false, error: "Choose which recipient list to test." });
    });

    it("can open its own page but is refused on the Admin's bank page and action", async () => {
      await expect(SettingsPage()).resolves.toBeDefined();
      await expectRedirectTo(() => BankSettingsPage(), "/panel/403");
      await expectRedirectTo(() => actions.saveBankSettingsAction(null, form(bankFields(""))), "/panel/403");
    });
  });

  describe("other sessions", () => {
    it("a session holding only product.view, or only discount.manage, is refused on both pages and every action", async () => {
      for (const keys of [[PERMISSIONS.PRODUCT_VIEW], [PERMISSIONS.DISCOUNT_MANAGE]]) {
        await signInAs(keys);
        await expectRedirectTo(() => BankSettingsPage(), "/panel/403");
        await expectRedirectTo(() => SettingsPage(), "/panel/403");
        await expectRedirectTo(() => actions.saveBankSettingsAction(null, form(bankFields(""))), "/panel/403");
        await expectRedirectTo(() => actions.saveStoreSettingsAction(null, form(storeFields(""))), "/panel/403");
        await expectRedirectTo(() => actions.sendTestEmailAction(null, form({ list: "order" })), "/panel/403");
      }
    });

    it("no session is sent to login", async () => {
      await expectRedirectTo(() => BankSettingsPage(), "/panel/login");
      await expectRedirectTo(() => SettingsPage(), "/panel/login");
      await expectRedirectTo(() => actions.saveBankSettingsAction(null, form(bankFields(""))), "/panel/login");
      await expectRedirectTo(() => actions.saveStoreSettingsAction(null, form(storeFields(""))), "/panel/login");
    });
  });
});
