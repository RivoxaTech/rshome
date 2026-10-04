/**
 * The panel login against the test database (S22 SEC-02/SEC-08): a failed attempt runs scrypt
 * whether or not the email exists, so response time never reveals which staff addresses are
 * real; an over-long email is refused by the schema before it can overflow the rate-limit
 * bucket column. `next/headers` is replaced since there is no Next request here (D35). Skips
 * without TEST_DATABASE_URL.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { roles, sessions, users } from "@/server/db/schema/access-control";
import { assertTestDatabase, resetTables } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers(),
}));

const verifyPassword = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/password")>();
  verifyPassword.mockImplementation(actual.verifyPassword);
  return { ...actual, verifyPassword };
});

type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("panel login (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let auth: typeof import("./service");
  let hashPassword: typeof import("@/server/auth/password").hashPassword;
  const PASSWORD = "correct-password-1";
  const ip = () => `login-test-${randomBytes(4).toString("hex")}`;

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    auth = await import("./service");
    ({ hashPassword } = await import("@/server/auth/password"));
  });

  beforeEach(async () => {
    await resetTables(db);
    verifyPassword.mockClear();
    const [role] = await db.insert(roles).values({ key: `login-${randomBytes(3).toString("hex")}`, name: "Login test" });
    const passwordHash = await hashPassword(PASSWORD);
    await db.insert(users).values([
      { name: "Active", email: "active@test.local", passwordHash, roleId: role.insertId, isActive: true },
      { name: "Inactive", email: "inactive@test.local", passwordHash, roleId: role.insertId, isActive: false },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("runs the password check exactly once for an unknown email, an inactive user and a wrong password alike", async () => {
    const generic = { ok: false, error: "Incorrect email or password." };
    expect(await auth.login({ email: "nobody@test.local", password: PASSWORD }, { ip: ip(), userAgent: "t" })).toEqual(generic);
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(await auth.login({ email: "inactive@test.local", password: PASSWORD }, { ip: ip(), userAgent: "t" })).toEqual(generic);
    expect(verifyPassword).toHaveBeenCalledTimes(2);
    expect(await auth.login({ email: "active@test.local", password: "wrong" }, { ip: ip(), userAgent: "t" })).toEqual(generic);
    expect(verifyPassword).toHaveBeenCalledTimes(3);
    expect(await auth.login({ email: "active@test.local", password: PASSWORD }, { ip: ip(), userAgent: "t" })).toEqual({ ok: true });
  });

  it("an unknown email costs as much time as a wrong password (no enumeration by timing)", async () => {
    const time = async (email: string, password: string) => {
      const started = performance.now();
      await auth.login({ email, password }, { ip: ip(), userAgent: "t" });
      return performance.now() - started;
    };
    const wrong = await time("active@test.local", "wrong");
    const unknown = await time("nobody@test.local", "wrong");
    // Both run one scrypt (tens of ms); without the dummy hash the unknown path is a few ms.
    expect(unknown).toBeGreaterThan(wrong * 0.5);
  });

  // S22 BUG-17: expired session rows used to stay forever.
  it("sweeps expired sessions when someone logs in", async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, "active@test.local"));
    await db.insert(sessions).values([
      { id: "a".repeat(64), userId: user.id, expiresAt: new Date(Date.now() - 60_000) },
      { id: "b".repeat(64), userId: user.id, expiresAt: new Date(Date.now() + 600_000) },
    ]);
    expect(await auth.login({ email: "active@test.local", password: PASSWORD }, { ip: ip(), userAgent: "t" })).toEqual({ ok: true });
    const ids = (await db.select({ id: sessions.id }).from(sessions)).map((row) => row.id);
    expect(ids).not.toContain("a".repeat(64));
    expect(ids).toContain("b".repeat(64));
    expect(ids).toHaveLength(2);
  });

  it("refuses an over-long email before it can reach the rate-limit bucket column", () => {
    const tooLong = `${"a".repeat(auth.LOGIN_EMAIL_MAX_LENGTH)}@test.local`;
    expect(auth.LoginInputSchema.safeParse({ email: tooLong, password: "x" }).success).toBe(false);
    expect(auth.LoginInputSchema.safeParse({ email: "Active@Test.local", password: "x" })).toMatchObject({ success: true, data: { email: "active@test.local" } });
  });
});
