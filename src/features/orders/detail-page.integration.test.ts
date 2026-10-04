/**
 * The panel order detail page end to end (S22 follow-up): an Admin session opens an existing bank
 * and COD order and gets the page, a missing order throws Next's `notFound()` (which the panel's own
 * `not-found.tsx` renders inside the frame), a Developer session is sent to 403 and no session to
 * login. Guards the flow a stale dev server made look broken. Skips without TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined) }),
  headers: async () => new Headers(),
}));

type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("panel order detail page (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let detail: typeof import("@/components/panel/orders/detail/OrderDetailPage").OrderDetailPage;
  let savePendingProof: typeof import("@/server/storage/proofs").savePendingProof;
  let encodeProofToken: typeof import("@/features/payments/proof-token").encodeProofToken;
  let env: typeof import("@/server/env").env;
  let ids: FixtureIds;
  let ipCounter = 0;

  async function signInAs(keys: readonly PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, [...keys]);
    current.cookies.set("panel_session", token);
  }
  // The route files only return the Server Component element; calling the component itself runs its
  // permission check and lookup, which is where notFound()/redirect() are thrown.
  const open = (orderNumber: string, back?: string) => detail({ orderNumber, back });

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ createOrder } = await import("@/features/checkout/service"));
    ({ savePendingProof } = await import("@/server/storage/proofs"));
    ({ encodeProofToken } = await import("@/features/payments/proof-token"));
    ({ env } = await import("@/server/env"));
    ({ OrderDetailPage: detail } = await import("@/components/panel/orders/detail/OrderDetailPage"));
  });

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ids = await seedFixtures(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function place(overrides: Record<string, unknown> = {}): Promise<string> {
    const placed = await createOrder(checkoutInput(ids, overrides), { ip: `detail-ip-${++ipCounter}` });
    if (!placed.ok) throw new Error(placed.error);
    return placed.orderNumber;
  }

  it("renders an existing COD order and an existing bank order for an Admin, with and without the back link", async () => {
    const cod = await place({ paymentMethod: "cod" });
    const sharp = (await import("sharp")).default;
    const webp = await sharp({ create: { width: 600, height: 1200, channels: 3, background: "#d8c8a8" } }).webp().toBuffer();
    const fileName = await savePendingProof(webp);
    const bank = await place({ paymentMethod: "bank_transfer", proofToken: encodeProofToken(fileName, new Date(Date.now() + 60_000), env.SESSION_SECRET) });

    await signInAs(ADMIN_DEFAULT_PERMISSIONS);
    await expect(open(cod, "/panel/orders/cod")).resolves.toBeDefined();
    await expect(open(cod)).resolves.toBeDefined();
    await expect(open(bank, "/panel/orders/bank?tab=need-review&page=1")).resolves.toBeDefined();
  });

  it("throws notFound() for an order that doesn't exist, so the panel's own not-found page renders", async () => {
    await signInAs(ADMIN_DEFAULT_PERMISSIONS);
    await expect(open("RSH-000000-ZZZZ")).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") });
  });

  it("sends a Developer to 403 and a visitor without a session to login", async () => {
    const cod = await place({ paymentMethod: "cod" });
    await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
    await expect(open(cod)).rejects.toMatchObject({ digest: expect.stringContaining(";/panel/403;") });
    current.cookies.clear();
    await expect(open(cod)).rejects.toMatchObject({ digest: expect.stringContaining(";/panel/login;") });
  });
});
