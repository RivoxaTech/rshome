/**
 * The panel's users CRUD against the test database (S20): the real Server Actions with the literal
 * field names the forms post, email normalisation and case-insensitive uniqueness, the self and
 * last-manager rules, session revocation on deactivate/role change/reset, the delete guard,
 * secret-free audit rows, the reset rate limit, and the Developer-vs-Admin RBAC wall. Mirrors
 * `coupons.integration.test.ts`. Skips without TEST_DATABASE_URL.
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
    // `login()` sets the new session cookie on success; the test only checks the result, not the jar.
    set: () => {},
  }),
  headers: async () => new Headers(),
}));

type Db = typeof import("@/server/db/client");
type PanelActions = typeof import("@/app/panel/(protected)/users/actions");

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

const PASSWORD = "temporary-pass-1";

describe.skipIf(!TEST_DATABASE_URL)("users CRUD (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let verifyPassword: typeof import("@/server/auth/password").verifyPassword;
  let hashPassword: typeof import("@/server/auth/password").hashPassword;
  let staffService: typeof import("./staff-service");
  let authService: typeof import("@/features/auth/service");
  let panelActions: PanelActions;
  let UsersPageBody: typeof import("@/components/panel/users/UsersPageBody").UsersPageBody;

  let actorId: number;
  let actorRoleId: number;
  /** A plain role with one harmless key, the default target role for new users. */
  let staffRoleId: number;
  /** A role holding `user.manage`, for the last-manager rule. */
  let managerRoleId: number;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<{ userId: number; token: string }> {
    const session = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", session.token);
    return session;
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  /** Exactly the fields `UserForm` posts on create. */
  const createInput = (overrides: Record<string, string | number> = {}) => ({
    name: "Sana Ali",
    email: "Sana.Ali@Example.com",
    roleId: staffRoleId,
    isActive: "true",
    password: PASSWORD,
    ...overrides,
  });

  async function roleWith(keys: PermissionKey[], key = `role-${randomBytes(3).toString("hex")}`): Promise<number> {
    const [role] = await db.insert(roles).values({ key, name: key });
    for (const permissionKey of keys) {
      const [existing] = await db.select().from(permissionsTable).where(eq(permissionsTable.key, permissionKey));
      const permissionId = existing?.id ?? (await db.insert(permissionsTable).values({ key: permissionKey }))[0].insertId;
      await db.insert(rolePermissions).values({ roleId: role.insertId, permissionId });
    }
    return role.insertId;
  }

  async function createViaAction(overrides: Record<string, string | number> = {}): Promise<number> {
    const result = await panelActions.createUserAction(null, form(createInput(overrides)));
    if (!result.ok) throw new Error(`createUserAction refused: ${result.error}`);
    return result.id!;
  }

  async function addSession(userId: number): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt: new Date(Date.now() + 60_000) });
    return token;
  }

  const sessionCount = async (userId: number) => (await db.select().from(sessions).where(eq(sessions.userId, userId))).length;
  const userRow = async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0];
  const auditRows = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "user"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  /** Posts the edit form as the page would, from a fresh version token. */
  async function updateViaAction(id: number, overrides: Record<string, string | number> = {}) {
    const data = await staffService.getUserForEdit(id);
    if (!data) throw new Error("user missing");
    return panelActions.updateUserAction(
      null,
      form({ id, name: data.user.name, email: data.user.email, roleId: data.user.roleId, isActive: String(data.user.isActive), version: data.version, ...overrides }),
    );
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ verifyPassword, hashPassword } = await import("@/server/auth/password"));
    staffService = await import("./staff-service");
    authService = await import("@/features/auth/service");
    panelActions = await import("@/app/panel/(protected)/users/actions");
    ({ UsersPageBody } = await import("@/components/panel/users/UsersPageBody"));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    const actor = await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
    actorId = actor.userId;
    actorRoleId = (await userRow(actorId)).roleId;
    staffRoleId = await roleWith([PERMISSIONS.PRODUCT_VIEW], "staff");
    managerRoleId = await roleWith([PERMISSIONS.USER_MANAGE], "managers");
  });

  describe("create", () => {
    it("creates the user through the real action, normalises the email, hashes the password and audits without secrets", async () => {
      const id = await createViaAction();
      const row = await userRow(id);
      expect(row).toMatchObject({ name: "Sana Ali", email: "sana.ali@example.com", roleId: staffRoleId, isActive: true, lastLoginAt: null });
      expect(row.passwordHash.startsWith("scrypt:")).toBe(true);
      expect(await verifyPassword(PASSWORD, row.passwordHash)).toBe(true);

      const [audit] = await auditRows(id, "user.create");
      expect(audit.userId).toBe(actorId);
      expect(audit.oldValues).toBeNull();
      expect(JSON.parse(audit.newValues!)).toEqual({ name: "Sana Ali", email: "sana.ali@example.com", roleId: staffRoleId, roleKey: "staff", isActive: true });
      expect(audit.newValues).not.toContain(PASSWORD);
      expect(audit.newValues).not.toContain("scrypt");

      // The new user can actually sign in with the temporary password.
      const login = await authService.login({ email: "sana.ali@example.com", password: PASSWORD }, { ip: "users-test-1", userAgent: "test" });
      expect(login).toEqual({ ok: true });
    });

    it("refuses a duplicate email case-insensitively, a short password and a missing role, as field errors", async () => {
      await createViaAction();
      const duplicate = await panelActions.createUserAction(null, form(createInput({ email: "SANA.ALI@example.COM", name: "Other" })));
      expect(duplicate).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });

      const short = await panelActions.createUserAction(null, form(createInput({ email: "b@example.com", password: "short" })));
      expect(short).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });

      const noRole = await panelActions.createUserAction(null, form(createInput({ email: "c@example.com", roleId: "" })));
      expect(noRole).toMatchObject({ ok: false, fieldErrors: { roleId: expect.any(String) } });

      const unknownRole = await panelActions.createUserAction(null, form(createInput({ email: "d@example.com", roleId: 999_999 })));
      expect(unknownRole).toMatchObject({ ok: false, fieldErrors: { roleId: expect.any(String) } });
    });

    it("can create an inactive user who then can't sign in", async () => {
      await createViaAction({ isActive: "false" });
      const login = await authService.login({ email: "sana.ali@example.com", password: PASSWORD }, { ip: "users-test-2", userAgent: "test" });
      expect(login.ok).toBe(false);
    });
  });

  describe("update", () => {
    it("saves name/email/role/active, redirects, and a role change revokes every session of that user", async () => {
      const id = await createViaAction();
      await addSession(id);
      await addSession(id);

      await expectRedirectTo(() => updateViaAction(id, { name: "Sana A.", email: "NEW@Example.com", roleId: managerRoleId }), "/panel/users");

      expect(await userRow(id)).toMatchObject({ name: "Sana A.", email: "new@example.com", roleId: managerRoleId, isActive: true });
      expect(await sessionCount(id)).toBe(0);
      expect(await auditRows(id, "user.update")).toHaveLength(1);
      const [roleChange] = await auditRows(id, "user.role_change");
      expect(JSON.parse(roleChange.oldValues!)).toEqual({ roleId: staffRoleId, roleKey: "staff" });
      expect(JSON.parse(roleChange.newValues!)).toEqual({ roleId: managerRoleId, roleKey: "managers" });
    });

    it("leaves sessions alone when only the name changes", async () => {
      const id = await createViaAction();
      await addSession(id);
      await expectRedirectTo(() => updateViaAction(id, { name: "Renamed" }), "/panel/users");
      expect(await sessionCount(id)).toBe(1);
      expect(await auditRows(id, "user.role_change")).toHaveLength(0);
    });

    it("deactivating through the form revokes sessions and audits user.deactivate", async () => {
      const id = await createViaAction();
      await addSession(id);
      await expectRedirectTo(() => updateViaAction(id, { isActive: "false" }), "/panel/users");
      expect((await userRow(id)).isActive).toBe(false);
      expect(await sessionCount(id)).toBe(0);
      expect(await auditRows(id, "user.deactivate")).toHaveLength(1);
    });

    it("refuses a stale edit", async () => {
      const id = await createViaAction();
      const stale = await staffService.getUserForEdit(id);
      await expectRedirectTo(() => updateViaAction(id, { name: "First save" }), "/panel/users");
      const result = await panelActions.updateUserAction(
        null,
        form({ id, name: "Second save", email: stale!.user.email, roleId: stale!.user.roleId, isActive: "true", version: stale!.version }),
      );
      expect(result).toEqual({ ok: false, error: staffService.STALE_USER_MESSAGE });
      expect((await userRow(id)).name).toBe("First save");
    });

    it("refuses deactivating or changing the role of your own account", async () => {
      const deactivate = await updateViaAction(actorId, { isActive: "false" });
      expect(deactivate).toMatchObject({ ok: false, fieldErrors: { isActive: expect.stringContaining("own account") } });

      const demote = await updateViaAction(actorId, { roleId: staffRoleId });
      expect(demote).toMatchObject({ ok: false, fieldErrors: { roleId: expect.stringContaining("own role") } });

      const quick = await panelActions.setUserActiveAction(null, form({ id: actorId, isActive: "false" }));
      expect(quick).toMatchObject({ ok: false, error: expect.stringContaining("own account") });

      expect((await userRow(actorId)).roleId).toBe(actorRoleId);
      expect(await sessionCount(actorId)).toBe(1);
    });

    it("protects the last active user who can manage users (service-level, since the actor's own account is covered by the self rule)", async () => {
      // Make the target the ONLY active holder of user.manage: move the actor to a role without it.
      const target = await createViaAction({ roleId: managerRoleId, email: "manager@example.com" });
      await db.update(users).set({ roleId: staffRoleId }).where(eq(users.id, actorId));
      const outsider = { id: actorId };

      expect(await staffService.setUserActive(target, false, outsider)).toMatchObject({ ok: false, error: expect.stringContaining("last active user") });
      const data = await staffService.getUserForEdit(target);
      expect(await staffService.updateUserById(target, { name: "Manager", email: "manager@example.com", roleId: staffRoleId, isActive: "true", version: data!.version }, outsider)).toMatchObject({
        ok: false,
        fieldErrors: { roleId: expect.stringContaining("last active user") },
      });
      expect(await staffService.deleteUserById(target, outsider)).toMatchObject({ ok: false, error: expect.stringContaining("last active user") });

      // A second active manager lifts the restriction (created through the service: the actor's session no longer holds user.manage).
      const second = await staffService.createUser(createInput({ roleId: managerRoleId, email: "manager2@example.com" }), outsider);
      expect(second.ok).toBe(true);
      expect(await staffService.setUserActive(target, false, outsider)).toEqual({ ok: true });
    });

    // S22 SEC-14: the same guard covers role.manage, or the roles page could be locked out through the users page.
    it("protects the last active user who can manage roles, too", async () => {
      const roleManagersId = await roleWith([PERMISSIONS.ROLE_MANAGE], "role-managers");
      const target = await createViaAction({ roleId: roleManagersId, email: "roles@example.com" });
      // The actor's own role carries role.manage as well, so first move the actor off it.
      await db.update(users).set({ roleId: staffRoleId }).where(eq(users.id, actorId));
      const outsider = { id: actorId };

      expect(await staffService.setUserActive(target, false, outsider)).toMatchObject({ ok: false, error: expect.stringContaining("manage users or roles") });
      const data = await staffService.getUserForEdit(target);
      expect(await staffService.updateUserById(target, { name: "Roles", email: "roles@example.com", roleId: managerRoleId, isActive: "true", version: data!.version }, outsider)).toMatchObject({
        ok: false,
        fieldErrors: { roleId: expect.stringContaining("manage users or roles") },
      });
      expect(await staffService.deleteUserById(target, outsider)).toMatchObject({ ok: false, error: expect.stringContaining("manage users or roles") });
    });

    // S22 SEC-07: a tampered hidden id answers "not found" instead of handing NaN to the database.
    it("quick actions refuse a tampered id without touching the database", async () => {
      for (const id of ["abc", "", "0", "-1", "1.5"]) {
        expect(await panelActions.setUserActiveAction(null, form({ id, isActive: "false" })), id).toEqual({ ok: false, error: "User not found." });
        expect(await panelActions.deleteUserAction(null, form({ id })), id).toEqual({ ok: false, error: "User not found." });
      }
    });
  });

  describe("quick activate/deactivate", () => {
    it("toggles in place, revokes sessions on deactivate, refuses a no-op", async () => {
      const id = await createViaAction();
      await addSession(id);
      expect(await panelActions.setUserActiveAction(null, form({ id, isActive: "false" }))).toEqual({ ok: true });
      expect(await sessionCount(id)).toBe(0);
      expect(await panelActions.setUserActiveAction(null, form({ id, isActive: "false" }))).toMatchObject({ ok: false });
      expect(await panelActions.setUserActiveAction(null, form({ id, isActive: "true" }))).toEqual({ ok: true });
      expect(await auditRows(id, "user.activate")).toHaveLength(1);
    });
  });

  describe("reset password", () => {
    it("replaces the hash, revokes every session, audits without the password, and is rate-limited per actor", async () => {
      const id = await createViaAction();
      await addSession(id);
      const before = (await userRow(id)).passwordHash;

      const result = await panelActions.resetUserPasswordAction(null, form({ id, password: "fresh-secret-99" }));
      expect(result).toEqual({ ok: true, id });
      const after = (await userRow(id)).passwordHash;
      expect(after).not.toBe(before);
      expect(await verifyPassword("fresh-secret-99", after)).toBe(true);
      expect(await sessionCount(id)).toBe(0);

      const [audit] = await auditRows(id, "user.password_reset");
      expect(audit.newValues).not.toContain("fresh-secret-99");
      expect(audit.newValues).not.toContain("scrypt");
      expect(JSON.parse(audit.newValues!)).toMatchObject({ email: "sana.ali@example.com", sessionsRevoked: true });

      expect(await panelActions.resetUserPasswordAction(null, form({ id, password: "short" }))).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });

      for (let attempt = 0; attempt < 9; attempt++) {
        expect((await panelActions.resetUserPasswordAction(null, form({ id, password: `another-pass-${attempt}` }))).ok).toBe(true);
      }
      expect(await panelActions.resetUserPasswordAction(null, form({ id, password: "one-too-many-1" }))).toMatchObject({ ok: false, error: expect.stringContaining("Too many") });
    });
  });

  describe("delete", () => {
    it("deletes a user who never signed in and has no history, and audits it", async () => {
      const id = await createViaAction();
      expect((await staffService.getUserForEdit(id))!.deleteGuard).toEqual({ allowed: true });
      await expectRedirectTo(() => panelActions.deleteUserAction(null, form({ id })), "/panel/users");
      expect(await userRow(id)).toBeUndefined();
      const [audit] = await auditRows(id, "user.delete");
      expect(JSON.parse(audit.oldValues!)).toMatchObject({ email: "sana.ali@example.com" });
    });

    it("refuses once the user has signed in or has audit rows (Deactivate instead), and refuses deleting yourself", async () => {
      const id = await createViaAction();
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
      const guard = (await staffService.getUserForEdit(id))!.deleteGuard;
      expect(guard).toMatchObject({ allowed: false, reason: expect.stringContaining("Deactivate") });
      expect(await panelActions.deleteUserAction(null, form({ id }))).toMatchObject({ ok: false, error: expect.stringContaining("Deactivate") });

      const withAudit = await createViaAction({ email: "audited@example.com" });
      await db.insert(auditLogs).values({ userId: withAudit, action: "product.update", entity: "product", entityId: "1", newValues: "{}" });
      expect(await panelActions.deleteUserAction(null, form({ id: withAudit }))).toMatchObject({ ok: false, error: expect.stringContaining("audit") });

      expect(await panelActions.deleteUserAction(null, form({ id: actorId }))).toMatchObject({ ok: false, error: expect.stringContaining("own account") });
      expect(await userRow(actorId)).toBeDefined();
    });
  });

  describe("list", () => {
    it("searches name and email, pages, and shows last login", async () => {
      await createViaAction({ name: "Alpha One", email: "alpha@example.com" });
      const beta = await createViaAction({ name: "Beta Two", email: "beta@example.com" });
      await db.update(users).set({ lastLoginAt: new Date("2026-10-03T18:30:00Z") }).where(eq(users.id, beta));

      const all = await staffService.listStaffUsers({ page: 1, pageSize: 25 });
      expect(all.total).toBe(3);
      const byEmail = await staffService.listStaffUsers({ q: "beta@", page: 1, pageSize: 25 });
      expect(byEmail.items.map((item) => item.name)).toEqual(["Beta Two"]);
      expect(byEmail.items[0].lastLoginAt).toBe("3 Oct 2026, 23:30");
      const paged = await staffService.listStaffUsers({ page: 2, pageSize: 25 });
      expect(paged.page).toBe(1);
      expect(paged.pageCount).toBe(1);
    });
  });

  describe("RBAC (C24)", () => {
    it("refuses an Admin session on the page and every action", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => UsersPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.createUserAction(null, form(createInput())), "/panel/403");
      await expectRedirectTo(() => panelActions.updateUserAction(null, form({ id: 1 })), "/panel/403");
      await expectRedirectTo(() => panelActions.setUserActiveAction(null, form({ id: 1, isActive: "false" })), "/panel/403");
      await expectRedirectTo(() => panelActions.resetUserPasswordAction(null, form({ id: 1, password: PASSWORD })), "/panel/403");
      await expectRedirectTo(() => panelActions.deleteUserAction(null, form({ id: 1 })), "/panel/403");
    });

    it("refuses a session holding an unrelated Developer key, and sends no session to login", async () => {
      await signInAs([PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.ROLE_MANAGE, PERMISSIONS.AUDIT_VIEW]);
      await expectRedirectTo(() => UsersPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.createUserAction(null, form(createInput())), "/panel/403");

      current.cookies.clear();
      await expectRedirectTo(() => UsersPageBody({ searchParams: {} }), "/panel/login");
      await expectRedirectTo(() => panelActions.createUserAction(null, form(createInput())), "/panel/login");
    });

    it("lets the Developer open the page", async () => {
      await expect(UsersPageBody({ searchParams: {} })).resolves.toBeDefined();
    });
  });

  it("hashPassword output never appears in any audit row written here", async () => {
    const id = await createViaAction();
    await panelActions.resetUserPasswordAction(null, form({ id, password: "fresh-secret-99" }));
    const rows = await db.select().from(auditLogs);
    const hash = (await userRow(id)).passwordHash;
    expect(hash).not.toBe(await hashPassword("fresh-secret-99")); // random salt: no two hashes alike
    for (const row of rows) {
      expect(`${row.oldValues ?? ""}${row.newValues ?? ""}`).not.toContain("scrypt:");
    }
  });
});
