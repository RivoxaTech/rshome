/**
 * Wholesale inquiries against the test database (S17): the storefront submission (rate limit,
 * honeypot), the push/email wiring, and the panel inbox's RBAC (Admin vs Developer vs a
 * wholesale.view-only session) and CSV export. `next/headers` is replaced the way every other
 * panel integration suite does (D35); `@/server/notify/push` and `@/server/mail/transport` are
 * mocked; `after()` runs inline, since there is no real Next request scope here. Skips without
 * TEST_DATABASE_URL.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { settings } from "@/server/db/schema/settings";
import { wholesaleInquiries, wholesaleInquiryItems, wholesaleInquiryNotes } from "@/server/db/schema/wholesale";
import { assertTestDatabase, createStaffSession, resetTables } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));
// `after()` requires a real Next request scope, which doesn't exist here (D35): run it inline,
// keeping its promise so tests can await the notify call's own DB work (subscriptions, settings)
// finishing — a bare microtask flush isn't enough once real I/O is involved.
const pendingAfter = vi.hoisted(() => ({ promises: [] as Promise<unknown>[] }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      pendingAfter.promises.push(Promise.resolve().then(fn));
    },
  };
});
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const sendPush = vi.hoisted(() => vi.fn());
vi.mock("@/server/notify/push", () => ({ sendPush }));
const sendMail = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/server/mail/transport", () => ({ sendMail }));

type Db = typeof import("@/server/db/client");
type PanelActions = typeof import("@/app/panel/(protected)/wholesale/actions");
type ExportRoute = typeof import("@/app/api/panel/wholesale/export/route");
type PollRoute = typeof import("@/app/api/panel/notifications/route");

describe.skipIf(!TEST_DATABASE_URL)("wholesale inquiries (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let createWholesaleInquiry: typeof import("./service").createWholesaleInquiry;
  let formAction: typeof import("@/app/(store)/wholesale/actions").createWholesaleInquiryAction;
  let panelActions: PanelActions;
  let staffService: typeof import("./staff-service");
  let exportRoute: ExportRoute;
  let pollRoute: PollRoute;
  let WholesalePageBody: typeof import("@/components/panel/wholesale/WholesalePageBody").WholesalePageBody;
  let WholesaleDetailPage: typeof import("@/components/panel/wholesale/detail/WholesaleDetailPage").WholesaleDetailPage;

  let ipCounter = 0;
  const nextIp = () => `wholesale-ip-${++ipCounter}`;

  /** Waits for every `after()` callback queued so far (including its own internal DB work) to settle. */
  async function flush() {
    const queued = pendingAfter.promises.splice(0, pendingAfter.promises.length);
    await Promise.all(queued);
  }

  function validInquiry(overrides: Record<string, unknown> = {}) {
    return {
      name: "Ayesha Raza",
      business: "Raza Catering",
      businessType: "restaurant_cafe",
      phone: "0301 2345678",
      email: "ayesha@example.com",
      city: "Karachi",
      neededByDate: "",
      items: [{ itemName: "Dinner plates", quantity: "50", note: "matte finish" }],
      message: "Need these for a wedding.",
      website: "",
      ...overrides,
    };
  }

  const form = (values: Record<string, string | number>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  async function signInAs(permissionKeys: PermissionKey[]): Promise<{ userId: number }> {
    const { userId, token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
    return { userId };
  }

  const auditOf = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "wholesale_inquiry"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  const notifyFailures = () => db.select().from(auditLogs).where(eq(auditLogs.action, "notify.failed"));

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ createWholesaleInquiry } = await import("./service"));
    ({ createWholesaleInquiryAction: formAction } = await import("@/app/(store)/wholesale/actions"));
    panelActions = await import("@/app/panel/(protected)/wholesale/actions");
    staffService = await import("./staff-service");
    exportRoute = await import("@/app/api/panel/wholesale/export/route");
    pollRoute = await import("@/app/api/panel/notifications/route");
    ({ WholesalePageBody } = await import("@/components/panel/wholesale/WholesalePageBody"));
    ({ WholesaleDetailPage } = await import("@/components/panel/wholesale/detail/WholesaleDetailPage"));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    pendingAfter.promises.length = 0;
    sendPush.mockReset();
    sendPush.mockResolvedValue({ ok: true });
    sendMail.mockReset();
    sendMail.mockResolvedValue(undefined);
    await resetTables(db);
  });

  // ── Submission ──────────────────────────────────────────────────────────────────────────────

  it("stores a valid submission with its items", async () => {
    const result = await createWholesaleInquiry(validInquiry(), { ip: nextIp() });
    expect(result).toEqual({ ok: true, notify: true, id: expect.any(Number) });

    const [inquiry] = await db.select().from(wholesaleInquiries);
    expect(inquiry).toMatchObject({ name: "Ayesha Raza", business: "Raza Catering", city: "Karachi", status: "new" });
    const items = await db.select().from(wholesaleInquiryItems);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ itemName: "Dinner plates", quantity: 50, note: "matte finish" });
  });

  it("the honeypot stores nothing and notifies nobody, but still looks successful", async () => {
    const result = await createWholesaleInquiry(validInquiry({ website: "https://spam.example" }), { ip: nextIp() });
    expect(result).toEqual({ ok: true, notify: false, id: null });
    expect(await db.select().from(wholesaleInquiries)).toHaveLength(0);
  });

  it("refuses the 6th submission from one IP inside the hour", async () => {
    const ip = nextIp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await createWholesaleInquiry(validInquiry({ phone: `030${attempt} 1111111` }), { ip });
      expect(result).toMatchObject({ ok: true });
    }
    expect(await createWholesaleInquiry(validInquiry(), { ip })).toEqual({
      ok: false,
      error: "Too many attempts. Please try again in a few minutes.",
    });
  });

  // ── Alerts ──────────────────────────────────────────────────────────────────────────────────

  it("pushes to every wholesale.view subscriber and emails the owner, with no personal data, only for a real submission", async () => {
    const { userId } = await signInAs([PERMISSIONS.WHOLESALE_VIEW]);
    const notify = await import("@/features/notify/service");
    await notify.subscribe(userId, { endpoint: "https://push.example.com/wholesale-1", keys: { p256dh: "p1", auth: "a1" } }, null);
    await db
      .insert(settings)
      .values({ key: "notify_owner_wholesale_emails", value: JSON.stringify(["owner@rshome.local"]) })
      .onDuplicateKeyUpdate({ set: { value: JSON.stringify(["owner@rshome.local"]) } });
    current.cookies.clear(); // the submission itself is anonymous

    const result = await formAction(validInquiry());
    expect(result).toEqual({ ok: true });
    await flush();

    expect(sendPush).toHaveBeenCalledTimes(1);
    const [subscription, payload] = sendPush.mock.calls[0];
    expect(subscription.p256dh).toBe("p1");
    expect(payload.tag).toMatch(/^wholesale-\d+$/);
    expect(payload.url).toMatch(/\/panel\/wholesale\/\d+$/);
    const payloadText = JSON.stringify(payload).toLowerCase();
    expect(payloadText).not.toContain("ayesha");
    expect(payloadText).not.toContain("2345678");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [message] = sendMail.mock.calls[0];
    expect(message.to).toBe("owner@rshome.local");
    expect((message.text ?? "").toLowerCase()).not.toContain("ayesha");

    sendPush.mockClear();
    sendMail.mockClear();
    const honeypot = await formAction(validInquiry({ website: "spam" }));
    expect(honeypot).toEqual({ ok: true });
    await flush();
    expect(sendPush).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("gives two submissions two pushes with different tags, so Chrome never silently replaces the first", async () => {
    const { userId } = await signInAs([PERMISSIONS.WHOLESALE_VIEW]);
    const notify = await import("@/features/notify/service");
    await notify.subscribe(userId, { endpoint: "https://push.example.com/wholesale-tags", keys: { p256dh: "p-tags", auth: "a-tags" } }, null);
    current.cookies.clear();

    await formAction(validInquiry({ phone: "0300 1111111" }));
    await flush();
    await formAction(validInquiry({ phone: "0300 2222222" }));
    await flush();

    expect(sendPush).toHaveBeenCalledTimes(2);
    const [, firstPayload] = sendPush.mock.calls[0];
    const [, secondPayload] = sendPush.mock.calls[1];
    expect(firstPayload.tag).not.toBe(secondPayload.tag);
    expect(firstPayload.url).not.toBe(secondPayload.url);
  });

  it("never pushes to a session holding order.view but not wholesale.view", async () => {
    const { userId } = await signInAs([PERMISSIONS.ORDER_VIEW]);
    const notify = await import("@/features/notify/service");
    await notify.subscribe(userId, { endpoint: "https://push.example.com/order-view-only", keys: { p256dh: "p-order", auth: "a-order" } }, null);
    current.cookies.clear();

    await formAction(validInquiry());
    await flush();

    expect(sendPush).not.toHaveBeenCalled();
  });

  it("never fails the submission when a push send fails, and logs notify.failed instead", async () => {
    const { userId } = await signInAs([PERMISSIONS.WHOLESALE_VIEW]);
    const notify = await import("@/features/notify/service");
    await notify.subscribe(userId, { endpoint: "https://push.example.com/wholesale-2", keys: { p256dh: "p2", auth: "a2" } }, null);
    current.cookies.clear();
    sendPush.mockRejectedValueOnce(new Error("push gateway down"));

    const result = await formAction(validInquiry());
    expect(result).toEqual({ ok: true });
    await flush();

    const failures = await notifyFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].entityId).toMatch(/^wholesale-\d+$/);
  });

  // ── Panel RBAC ──────────────────────────────────────────────────────────────────────────────

  it("an Admin session can list, view, change status (with an audit row), add a note and export", async () => {
    const created = await createWholesaleInquiry(validInquiry(), { ip: nextIp() });
    expect(created).toMatchObject({ ok: true });
    const [{ id }] = await db.select({ id: wholesaleInquiries.id }).from(wholesaleInquiries);

    await signInAs(ADMIN_DEFAULT_PERMISSIONS);

    await expect(WholesalePageBody({ searchParams: {} })).resolves.toBeDefined();
    await expect(WholesaleDetailPage({ id })).resolves.toBeDefined();

    const { items } = await staffService.listStaffWholesaleInquiries("all", { q: undefined, page: 1 }, new Set(ADMIN_DEFAULT_PERMISSIONS));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id, name: "Ayesha Raza", itemCount: 1 });

    const statusChange = await panelActions.changeWholesaleStatusAction(null, form({ id, status: "contacted" }));
    expect(statusChange).toEqual({ ok: true });
    expect((await db.select({ status: wholesaleInquiries.status }).from(wholesaleInquiries))[0].status).toBe("contacted");
    expect(await auditOf(id, "wholesale.status_change")).toHaveLength(1);

    const note = await panelActions.addWholesaleNoteAction(null, form({ id, note: "Called, sending a quote tomorrow." }));
    expect(note).toEqual({ ok: true });
    const notes = await db.select().from(wholesaleInquiryNotes).where(eq(wholesaleInquiryNotes.inquiryId, id));
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe("Called, sending a quote tomorrow.");

    const exported = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/wholesale/export`));
    expect(exported.status).toBe(200);
    expect(await exported.text()).toContain("Ayesha Raza");
    // S22 BUG-24: the export is audited and a capped file is marked in its name (this one is not capped).
    expect(exported.headers.get("content-disposition")).toMatch(/filename="wholesale-inquiries-\d{4}-\d{2}-\d{2}\.csv"/);
    const exportAudit = await db.select().from(auditLogs).where(eq(auditLogs.action, "wholesale.export"));
    expect(exportAudit).toHaveLength(1);
    expect(JSON.parse(exportAudit[0].newValues!)).toMatchObject({ tab: "all", rowCount: 1, truncated: false });
  });

  it("refuses a Developer session on the pages, every Server Action, the export route and the counts", async () => {
    const created = await createWholesaleInquiry(validInquiry(), { ip: nextIp() });
    expect(created).toMatchObject({ ok: true });
    const [{ id }] = await db.select({ id: wholesaleInquiries.id }).from(wholesaleInquiries);

    await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
    const forbidden = { digest: expect.stringContaining(";/panel/403;") };

    await expect(WholesalePageBody({ searchParams: {} })).rejects.toMatchObject(forbidden);
    await expect(WholesaleDetailPage({ id })).rejects.toMatchObject(forbidden);
    await expect(panelActions.changeWholesaleStatusAction(null, form({ id, status: "contacted" }))).rejects.toMatchObject(forbidden);
    await expect(panelActions.addWholesaleNoteAction(null, form({ id, note: "No permission" }))).rejects.toMatchObject(forbidden);

    expect((await exportRoute.GET(new Request(`${ORIGIN}/api/panel/wholesale/export`))).status).toBe(403);
    expect((await pollRoute.GET()).status).toBe(403);

    // Nothing was changed by the refused attempts.
    expect((await db.select({ status: wholesaleInquiries.status }).from(wholesaleInquiries))[0].status).toBe("new");
    expect(await db.select().from(wholesaleInquiryNotes)).toHaveLength(0);
  });

  it("a wholesale.view-only session can view but not change status or add a note", async () => {
    const created = await createWholesaleInquiry(validInquiry(), { ip: nextIp() });
    expect(created).toMatchObject({ ok: true });
    const [{ id }] = await db.select({ id: wholesaleInquiries.id }).from(wholesaleInquiries);

    await signInAs([PERMISSIONS.WHOLESALE_VIEW]);
    const forbidden = { digest: expect.stringContaining(";/panel/403;") };

    await expect(WholesalePageBody({ searchParams: {} })).resolves.toBeDefined();
    const detail = await WholesaleDetailPage({ id });
    expect(detail).toBeDefined();

    await expect(panelActions.changeWholesaleStatusAction(null, form({ id, status: "contacted" }))).rejects.toMatchObject(forbidden);
    await expect(panelActions.addWholesaleNoteAction(null, form({ id, note: "No permission" }))).rejects.toMatchObject(forbidden);

    const view = await staffService.getStaffWholesaleInquiry(id, new Set([PERMISSIONS.WHOLESALE_VIEW]));
    expect(view?.control.options).toEqual([]);
    expect(view?.canAddNote).toBe(false);
  });

  // ── CSV export ──────────────────────────────────────────────────────────────────────────────

  it("the export matches the current filter and neutralises spreadsheet formulas", async () => {
    await createWholesaleInquiry(validInquiry({ name: "=cmd|' /C calc'!A1", phone: "0300 1111111" }), { ip: nextIp() });
    const other = await createWholesaleInquiry(validInquiry({ name: "Bilal Ahmed", phone: "0300 2222222" }), { ip: nextIp() });
    expect(other).toMatchObject({ ok: true });

    const [{ id: bilalId }] = await db.select({ id: wholesaleInquiries.id }).from(wholesaleInquiries).where(eq(wholesaleInquiries.name, "Bilal Ahmed"));
    await signInAs(ADMIN_DEFAULT_PERMISSIONS);
    await panelActions.changeWholesaleStatusAction(null, form({ id: bilalId, status: "contacted" }));

    const filtered = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/wholesale/export?tab=contacted`));
    const csv = await filtered.text();
    expect(csv).toContain("Bilal Ahmed");
    expect(csv).not.toContain("cmd|");

    const all = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/wholesale/export`));
    const allCsv = await all.text();
    expect(allCsv).toContain("'=cmd");
  });
});
