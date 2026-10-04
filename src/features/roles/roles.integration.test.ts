/**
 * The panel's roles CRUD and permissions matrix against the test database (S20, owner decision
 * amending C24: the matrix is dynamic). Through the real Server Actions with the literal field
 * names the forms post: system roles editable, the Developer giving the Admin role product access
 * (and the Admin then reaching the products page on their next sign-in, and losing it again when
 * revoked), the Developer role being given and stripped of an order key, the sensitive-grant
 * confirmation flag being required, Reset to defaults, the no-lock-out and empty-with-members
 * guards, stale edits, delete rules, before/after audit rows, and the RBAC wall. Skips without
 * TEST_DATABASE_URL.
 */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { permissions as permissionsTable, rolePermissions, roles, sessions, users } from "@/server/db/schema/access-control";
import { auditLogs } from "@/server/db/schema/audit";
import { assertTestDatabase, createStaffSession, resetTables } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

type Db = typeof import("@/server/db/client");
type PanelActions = typeof import("@/app/panel/(protected)/roles/actions");

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

describe.skipIf(!TEST_DATABASE_URL)("roles and the permissions matrix (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let staffService: typeof import("./staff-service");
  let panelActions: PanelActions;
  let RolesPageBody: typeof import("@/components/panel/roles/RolesPageBody").RolesPageBody;
  let ProductsPageBody: typeof import("@/components/panel/products/ProductsPageBody").ProductsPageBody;
  let OrdersPageBody: typeof import("@/components/panel/orders/OrdersPageBody").OrdersPageBody;

  let developerRoleId: number;
  let adminRoleId: number;
  /** The signed-in Developer (a member of the `developer` system role). */
  let actorId: number;
  let actorToken: string;

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  async function permissionIds(keys: readonly PermissionKey[]): Promise<number[]> {
    const ids: number[] = [];
    for (const key of keys) {
      const [existing] = await db.select().from(permissionsTable).where(eq(permissionsTable.key, key));
      ids.push(existing?.id ?? (await db.insert(permissionsTable).values({ key }))[0].insertId);
    }
    return ids;
  }

  async function insertRole(key: string, keys: readonly PermissionKey[], isSystem = false): Promise<number> {
    const [role] = await db.insert(roles).values({ key, name: key, isSystem });
    const ids = await permissionIds(keys);
    if (ids.length > 0) await db.insert(rolePermissions).values(ids.map((permissionId) => ({ roleId: role.insertId, permissionId })));
    return role.insertId;
  }

  async function addUser(roleId: number, isActive = true): Promise<{ id: number; token: string }> {
    const [user] = await db.insert(users).values({ name: "Member", email: `${randomBytes(4).toString("hex")}@test.local`, passwordHash: "unused", roleId, isActive });
    const token = await addSession(user.insertId);
    return { id: user.insertId, token };
  }

  /** A fresh sign-in for an existing user (what "on the next request" means after a save revoked their sessions). */
  async function addSession(userId: number): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt: new Date(Date.now() + 60_000) });
    return token;
  }

  const signInWith = (token: string) => current.cookies.set("panel_session", token);

  const keysOf = async (roleId: number) => {
    const rows = await db
      .select({ key: permissionsTable.key })
      .from(rolePermissions)
      .innerJoin(permissionsTable, eq(permissionsTable.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId));
    return new Set(rows.map((row) => row.key));
  };
  const sessionCount = async (userId: number) => (await db.select().from(sessions).where(eq(sessions.userId, userId))).length;
  const auditRows = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "role"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  const version = async (roleId: number) => (await staffService.getRoleForEdit(roleId))!.version;

  /** The matrix column's Save, exactly as `PermissionMatrix` posts it. */
  async function saveColumn(roleId: number, keys: readonly PermissionKey[], confirmSensitive = false) {
    return panelActions.saveRolePermissionsAction(null, form({ id: roleId, version: await version(roleId), permissions: keys.join(","), confirmSensitive: String(confirmSensitive) }));
  }

  /** The per-role edit page's Save, exactly as `RoleForm` posts it. */
  async function saveForm(roleId: number, values: Record<string, string> = {}) {
    const data = await staffService.getRoleForEdit(roleId);
    if (!data) throw new Error("role missing");
    return panelActions.updateRoleAction(null, form({ id: roleId, name: data.role.name, permissions: data.permissions.join(","), version: data.version, confirmSensitive: "false", ...values }));
  }

  async function createViaAction(values: Record<string, string> = {}) {
    return panelActions.createRoleAction(null, form({ name: "Catalogue editor", key: "catalogue-editor", permissions: `${PERMISSIONS.PRODUCT_VIEW},${PERMISSIONS.PRODUCT_UPDATE}`, ...values }));
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    staffService = await import("./staff-service");
    panelActions = await import("@/app/panel/(protected)/roles/actions");
    ({ RolesPageBody } = await import("@/components/panel/roles/RolesPageBody"));
    ({ ProductsPageBody } = await import("@/components/panel/products/ProductsPageBody"));
    ({ OrdersPageBody } = await import("@/components/panel/orders/OrdersPageBody"));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    await permissionIds(Object.values(PERMISSIONS) as PermissionKey[]);
    developerRoleId = await insertRole("developer", DEVELOPER_DEFAULT_PERMISSIONS, true);
    adminRoleId = await insertRole("admin", ADMIN_DEFAULT_PERMISSIONS, true);
    const actor = await addUser(developerRoleId);
    actorId = actor.id;
    actorToken = actor.token;
    signInWith(actorToken);
  });

  describe("the dynamic matrix (owner decision amending C24)", () => {
    it("lets the Developer give the Admin role product access; the Admin reaches /panel/products on their next sign-in and loses it when revoked", async () => {
      const admin = await addUser(adminRoleId);
      signInWith(admin.token);
      await expectRedirectTo(() => ProductsPageBody({ searchParams: {} }), "/panel/403");

      signInWith(actorToken);
      // Without the confirmed warning the sensitive grant is refused and nothing changes.
      const refused = await saveColumn(adminRoleId, [...ADMIN_DEFAULT_PERMISSIONS, PERMISSIONS.PRODUCT_VIEW]);
      expect(refused).toMatchObject({ ok: false, fieldErrors: { confirmSensitive: staffService.CONFIRM_SENSITIVE_MESSAGE } });
      expect(await keysOf(adminRoleId)).toEqual(new Set(ADMIN_DEFAULT_PERMISSIONS));

      expect(await saveColumn(adminRoleId, [...ADMIN_DEFAULT_PERMISSIONS, PERMISSIONS.PRODUCT_VIEW], true)).toEqual({ ok: true, id: adminRoleId });
      expect(await keysOf(adminRoleId)).toEqual(new Set([...ADMIN_DEFAULT_PERMISSIONS, PERMISSIONS.PRODUCT_VIEW]));
      // The Admin's sessions were revoked by the save (they sign in again) and the editor's own session stayed.
      expect(await sessionCount(admin.id)).toBe(0);
      expect(await sessionCount(actorId)).toBe(1);

      signInWith(await addSession(admin.id));
      await expect(ProductsPageBody({ searchParams: {} })).resolves.toBeDefined();

      // The audit trail: the update with before/after, plus the confirmed sensitive grant with its key list.
      const [update] = await auditRows(adminRoleId, "role.update");
      expect(JSON.parse(update.oldValues!).permissions).toEqual(expect.arrayContaining(ADMIN_DEFAULT_PERMISSIONS));
      expect(JSON.parse(update.newValues!).permissions).toContain(PERMISSIONS.PRODUCT_VIEW);
      const [sensitive] = await auditRows(adminRoleId, "role.sensitive_grant");
      expect(JSON.parse(sensitive.newValues!)).toEqual({ roleKey: "admin", granted: [PERMISSIONS.PRODUCT_VIEW], confirmed: true });

      // Revoking needs no confirmation; the Admin is back to 403 on their next sign-in.
      signInWith(actorToken);
      expect(await saveColumn(adminRoleId, ADMIN_DEFAULT_PERMISSIONS)).toEqual({ ok: true, id: adminRoleId });
      signInWith(await addSession(admin.id));
      await expectRedirectTo(() => ProductsPageBody({ searchParams: {} }), "/panel/403");
      expect(await auditRows(adminRoleId, "role.sensitive_grant")).toHaveLength(1);
    });

    it("lets the Developer role be given an order key (confirmed) and have it removed again", async () => {
      await expectRedirectTo(() => OrdersPageBody({ method: "cod", searchParams: {} }), "/panel/403");

      const refused = await saveColumn(developerRoleId, [...DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS.ORDER_VIEW]);
      expect(refused).toMatchObject({ ok: false, fieldErrors: { confirmSensitive: expect.any(String) } });

      expect(await saveColumn(developerRoleId, [...DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS.ORDER_VIEW], true)).toEqual({ ok: true, id: developerRoleId });
      // The editor's own session survives the save of their own role; the new key applies on this very next request.
      expect(await sessionCount(actorId)).toBe(1);
      await expect(OrdersPageBody({ method: "cod", searchParams: {} })).resolves.toBeDefined();

      expect(await saveColumn(developerRoleId, DEVELOPER_DEFAULT_PERMISSIONS)).toEqual({ ok: true, id: developerRoleId });
      await expectRedirectTo(() => OrdersPageBody({ method: "cod", searchParams: {} }), "/panel/403");
    });

    it("needs no confirmation for a key on the role's own side, or for any key on a custom role", async () => {
      const custom = await insertRole("ops", [PERMISSIONS.PRODUCT_VIEW]);
      expect(await saveColumn(custom, [PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.ORDER_VIEW, PERMISSIONS.SETTINGS_BANK])).toEqual({ ok: true, id: custom });
      expect(await saveColumn(adminRoleId, [...ADMIN_DEFAULT_PERMISSIONS.filter((key) => key !== PERMISSIONS.ORDER_EXPORT)])).toEqual({ ok: true, id: adminRoleId });
      expect(await saveColumn(adminRoleId, ADMIN_DEFAULT_PERMISSIONS)).toEqual({ ok: true, id: adminRoleId });
      expect(await auditRows(adminRoleId, "role.sensitive_grant")).toHaveLength(0);
    });

    it("system roles are editable on their own page too (name and set), and Reset to defaults restores the code set", async () => {
      await expectRedirectTo(() => saveForm(adminRoleId, { name: "Store owner", permissions: [...ADMIN_DEFAULT_PERMISSIONS, PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.CATEGORY_MANAGE].join(","), confirmSensitive: "true" }), "/panel/roles");
      expect((await db.select().from(roles).where(eq(roles.id, adminRoleId)))[0].name).toBe("Store owner");
      expect(await keysOf(adminRoleId)).toEqual(new Set([...ADMIN_DEFAULT_PERMISSIONS, PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.CATEGORY_MANAGE]));

      const edit = await staffService.getRoleForEdit(adminRoleId);
      expect(edit!.defaults).toEqual(expect.arrayContaining(ADMIN_DEFAULT_PERMISSIONS));
      expect(await panelActions.resetRoleDefaultsAction(null, form({ id: adminRoleId, version: edit!.version }))).toEqual({ ok: true, id: adminRoleId });
      expect(await keysOf(adminRoleId)).toEqual(new Set(ADMIN_DEFAULT_PERMISSIONS));
      const [reset] = await auditRows(adminRoleId, "role.reset_defaults");
      expect(JSON.parse(reset.oldValues!).permissions).toContain(PERMISSIONS.PRODUCT_VIEW);
      expect(JSON.parse(reset.newValues!)).toMatchObject({ resetToDefaults: true, permissions: expect.not.arrayContaining([PERMISSIONS.PRODUCT_VIEW]) });

      // A stale version is refused, and a custom role has no defaults to reset to.
      expect(await panelActions.resetRoleDefaultsAction(null, form({ id: adminRoleId, version: edit!.version }))).toEqual({ ok: false, error: staffService.STALE_ROLE_MESSAGE });
      const custom = await insertRole("ops", [PERMISSIONS.PRODUCT_VIEW]);
      expect(await panelActions.resetRoleDefaultsAction(null, form({ id: custom, version: await version(custom) }))).toMatchObject({ ok: false, error: expect.stringContaining("system role") });
    });

    it("renders the matrix page for a role.manage session", async () => {
      await expect(RolesPageBody()).resolves.toBeDefined();
      const columns = await staffService.listRoleColumns();
      expect(columns.map((column) => column.key)).toEqual(["admin", "developer"]);
      expect(columns.find((column) => column.key === "developer")).toMatchObject({ isSystem: true, memberCount: 1, managesAccess: true });
    });
  });

  describe("guard rails", () => {
    it("no lock-out: the Developer role can't lose role.manage or user.manage while it's the only active source", async () => {
      const withoutRoleManage = DEVELOPER_DEFAULT_PERMISSIONS.filter((key) => key !== PERMISSIONS.ROLE_MANAGE);
      expect(await saveColumn(developerRoleId, withoutRoleManage)).toMatchObject({ ok: false, fieldErrors: { permissions: expect.stringContaining("role.manage") } });
      const withoutUserManage = DEVELOPER_DEFAULT_PERMISSIONS.filter((key) => key !== PERMISSIONS.USER_MANAGE);
      expect(await saveColumn(developerRoleId, withoutUserManage)).toMatchObject({ ok: false, fieldErrors: { permissions: expect.stringContaining("user.manage") } });
      expect(await keysOf(developerRoleId)).toEqual(new Set(DEVELOPER_DEFAULT_PERMISSIONS));

      // Another ACTIVE user holding role.manage through another role lifts the restriction; an inactive one doesn't.
      const other = await insertRole("other-admins", [PERMISSIONS.ROLE_MANAGE]);
      await addUser(other, false);
      expect(await saveColumn(developerRoleId, withoutRoleManage)).toMatchObject({ ok: false });
      await addUser(other, true);
      expect(await saveColumn(developerRoleId, withoutRoleManage)).toEqual({ ok: true, id: developerRoleId });
    });

    it("refuses saving a role with members and zero permissions, allows an empty role with none", async () => {
      expect(await saveColumn(adminRoleId, [])).toEqual({ ok: true, id: adminRoleId });
      const member = await addUser(adminRoleId);
      expect(await saveColumn(adminRoleId, ADMIN_DEFAULT_PERMISSIONS)).toEqual({ ok: true, id: adminRoleId });
      expect(await saveColumn(adminRoleId, [])).toMatchObject({ ok: false, fieldErrors: { permissions: expect.stringContaining("at least one") } });
      expect(await sessionCount(member.id)).toBe(0); // revoked by the earlier successful save, not by the refusal
    });

    it("refuses a stale edit from both the matrix and the edit page", async () => {
      const stale = await version(adminRoleId);
      expect(await saveColumn(adminRoleId, ADMIN_DEFAULT_PERMISSIONS.slice(0, -1))).toEqual({ ok: true, id: adminRoleId });
      expect(await panelActions.saveRolePermissionsAction(null, form({ id: adminRoleId, version: stale, permissions: ADMIN_DEFAULT_PERMISSIONS.join(","), confirmSensitive: "false" }))).toEqual({
        ok: false,
        error: staffService.STALE_ROLE_MESSAGE,
      });
      expect(await panelActions.updateRoleAction(null, form({ id: adminRoleId, name: "Admin", version: stale, permissions: ADMIN_DEFAULT_PERMISSIONS.join(","), confirmSensitive: "false" }))).toEqual({
        ok: false,
        error: staffService.STALE_ROLE_MESSAGE,
      });
    });

    it("saving a role signs its members out but keeps the editor's own session", async () => {
      const member = await addUser(developerRoleId);
      expect(await saveColumn(developerRoleId, [...DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS.PRODUCT_VIEW])).toEqual({ ok: true, id: developerRoleId });
      expect(await sessionCount(member.id)).toBe(0);
      expect(await db.select().from(sessions).where(eq(sessions.userId, actorId))).toEqual([expect.objectContaining({ id: hashToken(actorToken) })]);
    });
  });

  describe("create and delete", () => {
    it("creates a custom role with any keys (no 'grant only what you hold' rule) and audits the full key list", async () => {
      await expectRedirectTo(() => createViaAction({ permissions: `${PERMISSIONS.PRODUCT_VIEW},${PERMISSIONS.ORDER_VIEW}` }), "/panel/roles");
      const [role] = await db.select().from(roles).where(eq(roles.key, "catalogue-editor"));
      expect(role).toMatchObject({ name: "Catalogue editor", isSystem: false });
      expect(await keysOf(role.id)).toEqual(new Set([PERMISSIONS.ORDER_VIEW, PERMISSIONS.PRODUCT_VIEW]));
      const [audit] = await auditRows(role.id, "role.create");
      expect(JSON.parse(audit.newValues!)).toEqual({ key: "catalogue-editor", name: "Catalogue editor", isSystem: false, permissions: [PERMISSIONS.ORDER_VIEW, PERMISSIONS.PRODUCT_VIEW] });
    });

    it("refuses a duplicate key, a bad key and an unknown permission", async () => {
      await expectRedirectTo(() => createViaAction(), "/panel/roles");
      expect(await createViaAction({ name: "Again" })).toMatchObject({ ok: false, fieldErrors: { key: expect.any(String) } });
      expect(await createViaAction({ key: "Bad Key" })).toMatchObject({ ok: false, fieldErrors: { key: expect.any(String) } });
      expect(await createViaAction({ key: "fine-key", permissions: "nope.nothing" })).toMatchObject({ ok: false, fieldErrors: { permissions: expect.any(String) } });
    });

    it("never deletes a system role; deletes a custom role only once no user holds it", async () => {
      expect(await panelActions.deleteRoleAction(null, form({ id: adminRoleId }))).toEqual({ ok: false, error: staffService.SYSTEM_ROLE_DELETE_MESSAGE });
      expect(await staffService.checkRoleDeletable(developerRoleId)).toEqual({ allowed: false, reason: staffService.SYSTEM_ROLE_DELETE_MESSAGE });

      const custom = await insertRole("ops", [PERMISSIONS.PRODUCT_VIEW]);
      const member = await addUser(custom);
      expect(await panelActions.deleteRoleAction(null, form({ id: custom }))).toMatchObject({ ok: false, error: expect.stringContaining("Move them") });
      await db.update(users).set({ roleId: adminRoleId }).where(eq(users.id, member.id));
      await expectRedirectTo(() => panelActions.deleteRoleAction(null, form({ id: custom })), "/panel/roles");
      expect(await db.select().from(roles).where(eq(roles.id, custom))).toHaveLength(0);
      expect(await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, custom))).toHaveLength(0);
      const [audit] = await auditRows(custom, "role.delete");
      expect(JSON.parse(audit.oldValues!)).toMatchObject({ key: "ops", permissions: [PERMISSIONS.PRODUCT_VIEW] });
    });
  });

  describe("RBAC", () => {
    it("refuses a session without role.manage on the page and every action; no session goes to login", async () => {
      const { token } = await createStaffSession(db, hashToken, ADMIN_DEFAULT_PERMISSIONS);
      signInWith(token);
      await expectRedirectTo(() => RolesPageBody(), "/panel/403");
      await expectRedirectTo(() => createViaAction(), "/panel/403");
      await expectRedirectTo(() => panelActions.updateRoleAction(null, form({ id: adminRoleId })), "/panel/403");
      await expectRedirectTo(() => panelActions.saveRolePermissionsAction(null, form({ id: adminRoleId })), "/panel/403");
      await expectRedirectTo(() => panelActions.resetRoleDefaultsAction(null, form({ id: adminRoleId })), "/panel/403");
      await expectRedirectTo(() => panelActions.deleteRoleAction(null, form({ id: adminRoleId })), "/panel/403");

      const unrelated = await createStaffSession(db, hashToken, [PERMISSIONS.USER_MANAGE, PERMISSIONS.AUDIT_VIEW]);
      signInWith(unrelated.token);
      await expectRedirectTo(() => RolesPageBody(), "/panel/403");

      current.cookies.clear();
      await expectRedirectTo(() => RolesPageBody(), "/panel/login");
      await expectRedirectTo(() => createViaAction(), "/panel/login");
    });
  });
});
