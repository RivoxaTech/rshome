/**
 * Change password against the test database (BUILD_PLAN.md C25, ARCHITECTURE.md §4.5): the hash
 * update, the other-session cleanup (the caller's own session survives), the wrong-password
 * refusal, the per-user rate limit, and that the audit row holds no secret. `next/headers` is
 * replaced so `getCurrentSessionId` sees a chosen cookie, since there is no Next server around a
 * direct service call. Skips without TEST_DATABASE_URL.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertTestDatabase, resetTables } from "@/test/integration-fixtures";

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
}));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const CURRENT_PASSWORD = "original-password-1";
const NEW_PASSWORD = "brand-new-password-1";

type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("changePassword (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashPassword: typeof import("@/server/auth/password").hashPassword;
  let verifyPassword: typeof import("@/server/auth/password").verifyPassword;
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let changePassword: typeof import("./service").changePassword;
  let roles: typeof import("@/server/db/schema/access-control").roles;
  let users: typeof import("@/server/db/schema/access-control").users;
  let sessionsTable: typeof import("@/server/db/schema/access-control").sessions;
  let auditLogs: typeof import("@/server/db/schema/audit").auditLogs;

  let userId: number;

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashPassword, verifyPassword } = await import("@/server/auth/password"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ changePassword } = await import("./service"));
    ({ roles, users, sessions: sessionsTable } = await import("@/server/db/schema/access-control"));
    ({ auditLogs } = await import("@/server/db/schema/audit"));
  });

  afterAll(async () => {
    await pool.end();
  });

  async function addSession(): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await db.insert(sessionsTable).values({ id: hashToken(token), userId, expiresAt: new Date(Date.now() + 60_000) });
    return token;
  }

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    const [role] = await db.insert(roles).values({ key: `test-${randomBytes(4).toString("hex")}`, name: "Test role" });
    const [user] = await db.insert(users).values({
      name: "Staff",
      email: `${randomBytes(4).toString("hex")}@test.local`,
      passwordHash: await hashPassword(CURRENT_PASSWORD),
      roleId: role.insertId,
    });
    userId = user.insertId;
  });

  it("changes the hash, keeps the caller's session, deletes every other one, and writes a secret-free audit row", async () => {
    const currentToken = await addSession();
    const otherToken = await addSession();
    current.cookies.set("panel_session", currentToken);

    const result = await changePassword(userId, { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(result).toEqual({ ok: true });

    const [updated] = await db.select().from(users).where(eq(users.id, userId));
    expect(await verifyPassword(NEW_PASSWORD, updated.passwordHash)).toBe(true);
    expect(await verifyPassword(CURRENT_PASSWORD, updated.passwordHash)).toBe(false);

    const remaining = await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.userId, userId));
    expect(remaining).toEqual([{ id: hashToken(currentToken) }]);
    expect(remaining.map((row) => row.id)).not.toContain(hashToken(otherToken));

    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.entity, "user"));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe("user.password_change");
    expect(auditRows[0].oldValues).toBeNull();
    expect(auditRows[0].newValues).not.toContain(NEW_PASSWORD);
    expect(auditRows[0].newValues).not.toContain(CURRENT_PASSWORD);
  });

  it("refuses the wrong current password and leaves other sessions alone", async () => {
    const currentToken = await addSession();
    const otherToken = await addSession();
    current.cookies.set("panel_session", currentToken);

    const result = await changePassword(userId, { currentPassword: "totally-wrong", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(result.ok).toBe(false);

    const remaining = await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.userId, userId));
    expect(remaining.map((row) => row.id).sort()).toEqual([hashToken(currentToken), hashToken(otherToken)].sort());
  });

  it("blocks the 6th attempt in 15 minutes", async () => {
    current.cookies.set("panel_session", await addSession());

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await changePassword(userId, { currentPassword: "totally-wrong", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
      expect(result.ok).toBe(false);
    }

    const sixth = await changePassword(userId, { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(sixth).toEqual({ ok: false, error: "Too many attempts. Please try again later." });
  });
});
