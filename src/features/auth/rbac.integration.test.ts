/**
 * The disjoint RBAC defaults against the test database (BUILD_PLAN.md C24, S9b; seed behaviour
 * revised in S20): the seed's create-once / grant-new-keys-only / never-revoke behaviour, and that
 * a Developer session holding the DEFAULT set is refused on every order/wholesale
 * surface (pages, Server Actions, the proof route, the sidebar's order counts) while an Admin
 * session is refused on the products page. Mirrors the `next/headers` mock other panel
 * integration suites use, since there is no Next server around a direct call. Skips without
 * TEST_DATABASE_URL.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

type Db = typeof import("@/server/db/client");
type OrdersActions = typeof import("@/app/panel/(protected)/orders/actions");

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

describe.skipIf(!TEST_DATABASE_URL)("RBAC redesign (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let getPermissionKeysForRole: typeof import("./repo").getPermissionKeysForRole;
  let seedPermissionsAndRoles: typeof import("./seed-roles").seedPermissionsAndRoles;
  let OrdersPageBody: typeof import("@/components/panel/orders/OrdersPageBody").OrdersPageBody;
  let OrderDetailPage: typeof import("@/components/panel/orders/detail/OrderDetailPage").OrderDetailPage;
  let ProductsPageBody: typeof import("@/components/panel/products/ProductsPageBody").ProductsPageBody;
  let ordersActions: OrdersActions;
  let serveProof: (typeof import("@/app/api/files/proof/[id]/route"))["GET"];
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let getOrderCountsForPermissions: typeof import("@/features/orders/staff-service").getOrderCountsForPermissions;
  let roles: typeof import("@/server/db/schema/access-control").roles;

  let ids: FixtureIds;
  let codOrderNumber: string;
  let ipCounter = 0;
  const nextIp = () => `rbac-ip-${++ipCounter}`;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  const form = (values: Record<string, string> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };

  const getProof = (id: string | number) =>
    serveProof(new Request(`${ORIGIN}/api/files/proof/${id}`), { params: Promise.resolve({ id: String(id) }) });

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ getPermissionKeysForRole } = await import("./repo"));
    ({ seedPermissionsAndRoles } = await import("./seed-roles"));
    ({ OrdersPageBody } = await import("@/components/panel/orders/OrdersPageBody"));
    ({ OrderDetailPage } = await import("@/components/panel/orders/detail/OrderDetailPage"));
    ({ ProductsPageBody } = await import("@/components/panel/products/ProductsPageBody"));
    ordersActions = await import("@/app/panel/(protected)/orders/actions");
    ({ GET: serveProof } = await import("@/app/api/files/proof/[id]/route"));
    ({ createOrder } = await import("@/features/checkout/service"));
    ({ getOrderCountsForPermissions } = await import("@/features/orders/staff-service"));
    ({ roles } = await import("@/server/db/schema/access-control"));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ids = await seedFixtures(db);
    const placed = await createOrder(checkoutInput(ids), { ip: nextIp() });
    if (!placed.ok) throw new Error(placed.error);
    codOrderNumber = placed.orderNumber;
  });

  describe("seed: create once, grant new keys only, never revoke (S20)", () => {
    const seedInput = (extraDeveloperKeys: string[] = []) => ({
      keys: [...Object.values(PERMISSIONS), ...extraDeveloperKeys],
      descriptions: {} as Record<string, string>,
      defaults: {
        developer: { name: "Developer", permissions: [...DEVELOPER_DEFAULT_PERMISSIONS, ...extraDeveloperKeys] },
        admin: { name: "Admin", permissions: ADMIN_DEFAULT_PERMISSIONS },
      },
    });
    const roleId = async (key: string) => (await db.select().from(roles).where(eq(roles.key, key)))[0].id;

    it("creates both system roles with their full defaults on first run, and a re-run grants nothing", async () => {
      const first = await seedPermissionsAndRoles(seedInput());
      expect(first.createdRoles.sort()).toEqual(["admin", "developer"]);
      expect(new Set(await getPermissionKeysForRole(await roleId("developer")))).toEqual(new Set(DEVELOPER_DEFAULT_PERMISSIONS));
      expect(new Set(await getPermissionKeysForRole(await roleId("admin")))).toEqual(new Set(ADMIN_DEFAULT_PERMISSIONS));

      const second = await seedPermissionsAndRoles(seedInput());
      expect(second.createdRoles).toEqual([]);
      expect(second.newKeys).toEqual([]);
      expect(second.granted).toEqual({ developer: [], admin: [] });
    });

    it("does not undo a panel edit: a key granted to Admin stays, a key removed from Developer is not re-granted", async () => {
      await seedPermissionsAndRoles(seedInput());
      const { permissions: permissionsTable, rolePermissions } = await import("@/server/db/schema/access-control");
      const admin = await roleId("admin");
      const developer = await roleId("developer");
      const [productView] = await db.select().from(permissionsTable).where(eq(permissionsTable.key, PERMISSIONS.PRODUCT_VIEW));
      const [auditView] = await db.select().from(permissionsTable).where(eq(permissionsTable.key, PERMISSIONS.AUDIT_VIEW));
      await db.insert(rolePermissions).values({ roleId: admin, permissionId: productView.id });
      await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, developer), eq(rolePermissions.permissionId, auditView.id)));

      await seedPermissionsAndRoles(seedInput());

      expect(await getPermissionKeysForRole(admin)).toContain(PERMISSIONS.PRODUCT_VIEW);
      expect(await getPermissionKeysForRole(developer)).not.toContain(PERMISSIONS.AUDIT_VIEW);
    });

    it("grants a brand-new key to its default role only, once", async () => {
      await seedPermissionsAndRoles(seedInput());
      const result = await seedPermissionsAndRoles(seedInput(["product.publish"]));
      expect(result.newKeys).toEqual(["product.publish"]);
      expect(result.granted).toEqual({ developer: ["product.publish"], admin: [] });
      expect(await getPermissionKeysForRole(await roleId("developer"))).toContain("product.publish");
      expect(await getPermissionKeysForRole(await roleId("admin"))).not.toContain("product.publish");

      // The panel removes it again; the next run doesn't bring it back (the key is no longer new).
      const { permissions: permissionsTable, rolePermissions } = await import("@/server/db/schema/access-control");
      const [publish] = await db.select().from(permissionsTable).where(eq(permissionsTable.key, "product.publish"));
      await db.delete(rolePermissions).where(eq(rolePermissions.permissionId, publish.id));
      const again = await seedPermissionsAndRoles(seedInput(["product.publish"]));
      expect(again.granted).toEqual({ developer: [], admin: [] });
      expect(await getPermissionKeysForRole(await roleId("developer"))).not.toContain("product.publish");
    });
  });

  describe("Developer session", () => {
    beforeEach(() => signInAs(DEVELOPER_DEFAULT_PERMISSIONS));

    it("is refused on both orders list pages", async () => {
      await expectRedirectTo(() => OrdersPageBody({ method: "bank_transfer", searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => OrdersPageBody({ method: "cod", searchParams: {} }), "/panel/403");
    });

    it("is refused on an order detail page", async () => {
      await expectRedirectTo(() => OrderDetailPage({ orderNumber: codOrderNumber, back: undefined }), "/panel/403");
    });

    it("is refused on every order Server Action", async () => {
      await expectRedirectTo(() => ordersActions.approveOrderAction(null, form({ orderNumber: codOrderNumber })), "/panel/403");
      await expectRedirectTo(() => ordersActions.reviewProofAction(null, form({ proofId: "1" })), "/panel/403");
      await expectRedirectTo(() => ordersActions.updateFulfilmentAction(null, form({ orderNumber: codOrderNumber, status: "processing" })), "/panel/403");
      await expectRedirectTo(() => ordersActions.closeOrderAction(null, form({ orderNumber: codOrderNumber, action: "cancel", reason: "x" })), "/panel/403");
      await expectRedirectTo(() => ordersActions.addOrderNoteAction(null, form({ orderNumber: codOrderNumber, note: "x" })), "/panel/403");
      await expectRedirectTo(() => ordersActions.deleteOrderAction(null, form({ orderNumber: codOrderNumber })), "/panel/403");
    });

    it("is refused on the payment-proof route (holds neither order.verify_payment nor order.view)", async () => {
      expect((await getProof(1)).status).toBe(403);
    });

    it("gets no order counts from the layout's helper (no leak)", async () => {
      const counts = await getOrderCountsForPermissions(new Set(DEVELOPER_DEFAULT_PERMISSIONS));
      expect(counts).toEqual({});
    });

    it("can still open its own page (products)", async () => {
      await expect(ProductsPageBody({ searchParams: {} })).resolves.toBeDefined();
    });
  });

  describe("Admin session", () => {
    beforeEach(() => signInAs(ADMIN_DEFAULT_PERMISSIONS));

    it("is refused on the products page", async () => {
      await expectRedirectTo(() => ProductsPageBody({ searchParams: {} }), "/panel/403");
    });

    it("can still open its own orders counts", async () => {
      const counts = await getOrderCountsForPermissions(new Set(ADMIN_DEFAULT_PERMISSIONS));
      expect(counts).toEqual({ "orders-bank": expect.any(Number), "orders-cod": expect.any(Number) });
    });
  });
});
