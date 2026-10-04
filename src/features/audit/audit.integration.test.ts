/**
 * The audit viewer against the test database (S20): newest-first ordering, every filter (actor,
 * System, action, entity, entity-id contains, Karachi date range), pagination and the
 * past-the-end clamp, and the RBAC wall (Admin 403, unrelated key 403, no session → login).
 * Skips without TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { assertTestDatabase, createStaffSession, resetTables } from "@/test/integration-fixtures";
import { auditListQuerySchema } from "./schemas";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

type Db = typeof import("@/server/db/client");

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

describe.skipIf(!TEST_DATABASE_URL)("audit viewer (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let staffService: typeof import("./staff-service");
  let AuditPageBody: typeof import("@/components/panel/audit/AuditPageBody").AuditPageBody;

  let developerId: number;
  let otherId: number;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<number> {
    const session = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", session.token);
    return session.userId;
  }

  const query = (values: Record<string, string> = {}) => auditListQuerySchema.parse(values);

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    staffService = await import("./staff-service");
    ({ AuditPageBody } = await import("@/components/panel/audit/AuditPageBody"));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    otherId = await signInAs([PERMISSIONS.PRODUCT_VIEW]);
    developerId = await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);

    // 23:30 Karachi on 3 Oct = 18:30 UTC; 00:10 Karachi on 4 Oct = 19:10 UTC on 3 Oct.
    await db.insert(auditLogs).values([
      { userId: developerId, action: "product.update", entity: "product", entityId: "41", oldValues: '{"price":"100.00"}', newValues: '{"price":"120.00"}', createdAt: new Date("2026-10-01T05:00:00Z") },
      { userId: otherId, action: "coupon.create", entity: "coupon", entityId: "7", oldValues: null, newValues: '{"code":"SAVE10"}', createdAt: new Date("2026-10-02T05:00:00Z") },
      { userId: null, action: "notify.failed", entity: "notify", entityId: "order:RSH-1", oldValues: null, newValues: '{"error":"smtp down"}', createdAt: new Date("2026-10-03T18:30:00Z") },
      { userId: developerId, action: "settings.update", entity: "settings", entityId: "bank_accounts", oldValues: '{"value":[]}', newValues: '{"value":[{"accountNumber":"****1234"}]}', createdAt: new Date("2026-10-03T19:10:00Z") },
      { userId: developerId, action: "product.update", entity: "product", entityId: "410", oldValues: "{}", newValues: "{}", createdAt: new Date("2026-10-03T19:10:00Z") },
    ]);
  });

  it("lists newest first with actor names, labels and 'System' for a row with no user", async () => {
    const { items, total } = await staffService.listAuditLog(query());
    expect(total).toBe(5);
    expect(items.map((item) => item.entityId)).toEqual(["410", "bank_accounts", "order:RSH-1", "7", "41"]);
    expect(items[2]).toMatchObject({ actor: "System", actorId: null, actionLabel: "Notification failed", entityLabel: "Notification", at: "3 Oct 2026, 23:30" });
    expect(items[1]).toMatchObject({ actor: "Staff", actorId: developerId, actionLabel: "Setting changed", at: "4 Oct 2026, 00:10" });
  });

  it("filters by actor, System, action, entity and an entity-id contains match", async () => {
    expect((await staffService.listAuditLog(query({ user: String(otherId) }))).items.map((item) => item.entityId)).toEqual(["7"]);
    expect((await staffService.listAuditLog(query({ user: "system" }))).items.map((item) => item.entityId)).toEqual(["order:RSH-1"]);
    expect((await staffService.listAuditLog(query({ action: "product.update" }))).total).toBe(2);
    expect((await staffService.listAuditLog(query({ entity: "settings" }))).items.map((item) => item.entityId)).toEqual(["bank_accounts"]);
    expect((await staffService.listAuditLog(query({ entityId: "41" }))).items.map((item) => item.entityId)).toEqual(["410", "41"]);
    expect((await staffService.listAuditLog(query({ entity: "product", entityId: "410" }))).total).toBe(1);
    // An unknown action or entity in the URL falls back to "no filter" rather than failing.
    expect((await staffService.listAuditLog(query({ action: "made.up", entity: "nothing" }))).total).toBe(5);
  });

  it("applies the date range on Karachi calendar days", async () => {
    // 3 Oct (Karachi) holds only the 23:30 row; the two 00:10 rows belong to 4 Oct.
    expect((await staffService.listAuditLog(query({ from: "2026-10-03", to: "2026-10-03" }))).items.map((item) => item.entityId)).toEqual(["order:RSH-1"]);
    expect((await staffService.listAuditLog(query({ from: "2026-10-04" }))).items.map((item) => item.entityId)).toEqual(["410", "bank_accounts"]);
    expect((await staffService.listAuditLog(query({ to: "2026-10-02" }))).items.map((item) => item.entityId)).toEqual(["7", "41"]);
  });

  it("paginates and clamps a page past the end", async () => {
    const first = await staffService.listAuditLog(query({ pageSize: "25" }));
    expect(first.pageCount).toBe(1);
    const far = await staffService.listAuditLog({ ...query(), page: 9 });
    expect(far.page).toBe(1);
    expect(far.items).toHaveLength(5);
  });

  describe("RBAC (C24)", () => {
    it("refuses an Admin session and an unrelated-key session, sends no session to login, lets the Developer in", async () => {
      await expect(AuditPageBody({ searchParams: {} })).resolves.toBeDefined();

      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => AuditPageBody({ searchParams: {} }), "/panel/403");

      await signInAs([PERMISSIONS.USER_MANAGE, PERMISSIONS.ROLE_MANAGE]);
      await expectRedirectTo(() => AuditPageBody({ searchParams: {} }), "/panel/403");

      current.cookies.clear();
      await expectRedirectTo(() => AuditPageBody({ searchParams: {} }), "/panel/login");
    });
  });
});
