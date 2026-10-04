/**
 * S22 BUG-09: the catalog services checked `errno` on the error Drizzle throws, but Drizzle wraps
 * the driver error (`DrizzleQueryError.cause`), so the "slug/SKU already in use" branch never ran
 * and a unique-index collision became a 500. The slug pre-check is mocked away here so the insert
 * itself hits the unique index, exactly like two staff members creating the same slug at once.
 * Skips without TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertTestDatabase, createStaffSession, resetTables } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

vi.mock("@/features/catalog/staff-repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/catalog/staff-repo")>();
  return { ...actual, slugInUse: async () => false };
});

type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("duplicate-key refusals (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let staff: typeof import("./staff-service");
  let actorId: number;

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    const { hashToken } = await import("@/server/auth/session");
    staff = await import("./staff-service");
    await resetTables(db);
    ({ userId: actorId } = await createStaffSession(db, hashToken, ["category.manage"]));
  });

  beforeEach(async () => {
    await resetTables(db);
    const { hashToken } = await import("@/server/auth/session");
    ({ userId: actorId } = await createStaffSession(db, hashToken, ["category.manage"]));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("a slug that slips past the pre-check and hits the unique index is a field error, not a crash", async () => {
    const input = { name: "Trays", slug: "trays", description: "", imagePath: "", sortOrder: "0", isActive: "true", parentId: "" };
    expect(await staff.createCategory(input, { id: actorId })).toMatchObject({ ok: true });
    const second = await staff.createCategory({ ...input, name: "Trays again" }, { id: actorId });
    expect(second).toMatchObject({ ok: false, fieldErrors: { slug: "Already in use." } });
  });
});
