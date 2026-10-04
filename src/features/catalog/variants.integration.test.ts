/**
 * The panel's variant CRUD against the test database (S10), through the real Server
 * Actions with the dialog's literal FormData field names: create, edit, the SKU clash, identical
 * attributes refused, stock and price-override audit rows, delete refused once ordered and allowed
 * otherwise, the last-variant rules, reorder keeping dense positions, the storefront's cheapest
 * price card and inactive-variant filtering, and the Developer-vs-Admin RBAC wall.
 */
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { categories, productVariants } from "@/server/db/schema/catalog";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

type Db = typeof import("@/server/db/client");
type VariantActions = typeof import("@/app/panel/(protected)/products/[id]/actions");

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

describe.skipIf(!TEST_DATABASE_URL)("product variants (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let productsService: typeof import("./products-staff-service");
  let variantsService: typeof import("./variants-staff-service");
  let storefront: typeof import("./service");
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let actions: VariantActions;
  let EditProductPage: typeof import("@/app/panel/(protected)/products/[id]/page").default;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  /** The Add/Edit dialog's wire format: every field it posts, with the given overrides. */
  const variantForm = (overrides: Record<string, string | number> = {}) => ({
    label: "",
    sku: "VAR-RED-L",
    priceOverride: "",
    stock: "4",
    weightGrams: "",
    isActive: "true",
    attributeKey0: "Colour",
    attributeValue0: "Red",
    attributeKey1: "Size",
    attributeValue1: "Large",
    ...overrides,
  });

  const productForm = (categoryId: number, overrides: Record<string, string> = {}) => ({
    name: "Linen Napkin",
    slug: "linen-napkin",
    categoryId: String(categoryId),
    shortDescription: "",
    description: "",
    price: "1000.00",
    weightGrams: "",
    status: "active",
    isFeatured: "false",
    imagePath: "",
    imagePathWidth: "",
    imagePathHeight: "",
    sku: "NAPKIN-DEFAULT",
    stock: "10",
    ...overrides,
  });

  const variantAuditRows = (variantId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "product_variant"), eq(auditLogs.entityId, String(variantId)), eq(auditLogs.action, action)));

  const orderAuditRows = (productId: number) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "product_variant_order"), eq(auditLogs.entityId, String(productId)), eq(auditLogs.action, "variant.sort_change")));

  async function variantsOf(productId: number) {
    return db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    productsService = await import("./products-staff-service");
    variantsService = await import("./variants-staff-service");
    storefront = await import("./service");
    ({ createOrder } = await import("@/features/checkout/service"));
    actions = await import("@/app/panel/(protected)/products/[id]/actions");
    ({ default: EditProductPage } = await import("@/app/panel/(protected)/products/[id]/page"));
  });

  afterAll(async () => {
    await pool.end();
  });

  let actorId: number;
  let categoryId: number;
  let productId: number;
  let defaultVariantId: number;

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ({ userId: actorId } = await createStaffSession(db, hashToken, DEVELOPER_DEFAULT_PERMISSIONS));
    const [category] = await db.insert(categories).values({ name: "Test Category", slug: "test-category", isActive: true });
    categoryId = category.insertId;
    const created = await productsService.createProduct(productForm(categoryId), { id: actorId });
    if (!created.ok) throw new Error(`createProduct failed: ${created.error}`);
    productId = created.id!;
    [{ id: defaultVariantId }] = await variantsOf(productId);
    await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
  });

  describe("create and edit through the Server Actions", () => {
    it("createVariantAction stores the attributes, the generated label, appends the position and writes variant.create", async () => {
      const result = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;

      const rows = await variantsOf(productId);
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ id: result.id, sku: "VAR-RED-L", label: "Red / Large", stock: 4, priceOverride: null, isActive: true, sortOrder: 1 });
      expect(JSON.parse(rows[1].attributes)).toEqual({ Colour: "Red", Size: "Large" });
      expect(await variantAuditRows(result.id!, "variant.create")).toHaveLength(1);

      const panel = await variantsService.getPanelVariants(productId);
      expect(panel.map((variant) => variant.position)).toEqual([1, 2]);
      expect(panel[1].attributes).toEqual({ Colour: "Red", Size: "Large" });
    });

    it("updateVariantAction edits every field and writes the stock and price-override audit rows with old and new values", async () => {
      const created = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      if (!created.ok) throw new Error("unreachable");

      const result = await actions.updateVariantAction(
        null,
        form({ variantId: created.id!, ...variantForm({ label: "Crimson L", sku: "VAR-CRIMSON-L", priceOverride: "1250", stock: "9", weightGrams: "300", attributeValue0: "Crimson" }) }),
      );
      expect(result).toMatchObject({ ok: true });

      const [row] = await db.select().from(productVariants).where(eq(productVariants.id, created.id!));
      expect(row).toMatchObject({ label: "Crimson L", sku: "VAR-CRIMSON-L", priceOverride: "1250.00", stock: 9, weightGrams: 300 });
      expect(JSON.parse(row.attributes)).toEqual({ Colour: "Crimson", Size: "Large" });

      expect(await variantAuditRows(created.id!, "variant.update")).toHaveLength(1);
      const [stockAudit] = await variantAuditRows(created.id!, "variant.stock_change");
      expect(JSON.parse(stockAudit.oldValues!)).toEqual({ stock: 4 });
      expect(JSON.parse(stockAudit.newValues!)).toEqual({ stock: 9 });
      const [priceAudit] = await variantAuditRows(created.id!, "variant.price_override_change");
      expect(JSON.parse(priceAudit.oldValues!)).toEqual({ priceOverride: null });
      expect(JSON.parse(priceAudit.newValues!)).toEqual({ priceOverride: "1250.00" });
    });

    it("an edit that changes neither stock nor price override writes only variant.update", async () => {
      const created = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      if (!created.ok) throw new Error("unreachable");

      await actions.updateVariantAction(null, form({ variantId: created.id!, ...variantForm({ label: "Renamed" }) }));
      expect(await variantAuditRows(created.id!, "variant.update")).toHaveLength(1);
      expect(await variantAuditRows(created.id!, "variant.stock_change")).toHaveLength(0);
      expect(await variantAuditRows(created.id!, "variant.price_override_change")).toHaveLength(0);
    });

    it("refuses a SKU already used by any product, as a field error", async () => {
      const result = await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "NAPKIN-DEFAULT" }) }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.fieldErrors?.sku).toMatch(/already in use/);

      const other = await productsService.createProduct(productForm(categoryId, { slug: "other-product", sku: "OTHER-DEFAULT" }), { id: actorId });
      if (!other.ok) throw new Error("unreachable");
      const clash = await actions.createVariantAction(null, form({ productId: other.id!, ...variantForm({ sku: "napkin-default" }) }));
      // SKUs compare case-insensitively under utf8mb4_unicode_ci — the unique index would refuse it too.
      expect(clash.ok).toBe(false);
    });

    it("keeping its own SKU on edit is not a clash", async () => {
      const created = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      if (!created.ok) throw new Error("unreachable");
      const result = await actions.updateVariantAction(null, form({ variantId: created.id!, ...variantForm({ stock: "5" }) }));
      expect(result.ok).toBe(true);
    });

    it("refuses a second variant of the same product with an identical attribute set (order- and case-insensitive)", async () => {
      await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      const result = await actions.createVariantAction(
        null,
        form({ productId, ...variantForm({ sku: "VAR-RED-L-2", attributeKey0: "size", attributeValue0: "large", attributeKey1: "colour", attributeValue1: "RED" }) }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/already has exactly these attributes/);
      expect(await variantsOf(productId)).toHaveLength(2);
    });

    it("a second attribute-less variant clashes with the existing 'Default' one", async () => {
      const result = await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-2", attributeKey0: "", attributeValue0: "", attributeKey1: "", attributeValue1: "" }) }));
      expect(result.ok).toBe(false);
    });

    it("returns field errors from the shared schema instead of throwing", async () => {
      const result = await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "", stock: "-2", attributeKey1: "", attributeValue1: "L" }) }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.fieldErrors).toMatchObject({ sku: expect.any(String), stock: expect.any(String), attributeKey1: "Enter an attribute name." });
    });
  });

  describe("quick actions", () => {
    it("setVariantStockAction changes the stock and writes variant.stock_change with old and new", async () => {
      const result = await actions.setVariantStockAction(null, form({ variantId: defaultVariantId, stock: "0" }));
      expect(result.ok).toBe(true);
      const [row] = await db.select().from(productVariants).where(eq(productVariants.id, defaultVariantId));
      expect(row.stock).toBe(0);
      const [audit] = await variantAuditRows(defaultVariantId, "variant.stock_change");
      expect(JSON.parse(audit.oldValues!)).toEqual({ stock: 10 });
      expect(JSON.parse(audit.newValues!)).toEqual({ stock: 0 });

      const invalid = await actions.setVariantStockAction(null, form({ variantId: defaultVariantId, stock: "-1" }));
      expect(invalid).toMatchObject({ ok: false, fieldErrors: { stock: expect.any(String) } });
    });

    it("setVariantActiveAction deactivates and reactivates with one audit row each", async () => {
      const second = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      if (!second.ok) throw new Error("unreachable");

      expect(await actions.setVariantActiveAction(null, form({ variantId: second.id!, isActive: "false" }))).toMatchObject({ ok: true });
      expect((await db.select().from(productVariants).where(eq(productVariants.id, second.id!)))[0].isActive).toBe(false);
      expect(await variantAuditRows(second.id!, "variant.deactivate")).toHaveLength(1);

      expect(await actions.setVariantActiveAction(null, form({ variantId: second.id!, isActive: "true" }))).toMatchObject({ ok: true });
      expect(await variantAuditRows(second.id!, "variant.activate")).toHaveLength(1);
    });
  });

  describe("the last-variant rules", () => {
    it("the last active variant of an Active product can't be deactivated — archive the product instead", async () => {
      const result = await actions.setVariantActiveAction(null, form({ variantId: defaultVariantId, isActive: "false" }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Archive the product instead/);

      const viaEdit = await actions.updateVariantAction(null, form({ variantId: defaultVariantId, ...variantForm({ sku: "NAPKIN-DEFAULT", isActive: "false", attributeKey0: "", attributeValue0: "", attributeKey1: "", attributeValue1: "" }) }));
      expect(viaEdit.ok).toBe(false);
      expect((await db.select().from(productVariants).where(eq(productVariants.id, defaultVariantId)))[0].isActive).toBe(true);
    });

    it("the same variant can be deactivated once the product isn't Active", async () => {
      await productsService.setProductStatus(productId, "draft", { id: actorId });
      const result = await actions.setVariantActiveAction(null, form({ variantId: defaultVariantId, isActive: "false" }));
      expect(result.ok).toBe(true);
    });

    it("the last variant can't be deleted, even on a draft product", async () => {
      await productsService.setProductStatus(productId, "draft", { id: actorId });
      const result = await actions.deleteVariantAction(null, form({ variantId: defaultVariantId }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/at least one variant/);
      expect(await variantsOf(productId)).toHaveLength(1);
    });

    it("the last active variant of an Active product can't be deleted either, while an inactive sibling exists", async () => {
      const second = await actions.createVariantAction(null, form({ productId, ...variantForm({ isActive: "false" }) }));
      if (!second.ok) throw new Error("unreachable");
      const result = await actions.deleteVariantAction(null, form({ variantId: defaultVariantId }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Archive the product instead/);
    });
  });

  describe("delete", () => {
    it("refuses deleting a variant that appears on an order, offering Deactivate instead, and the panel row knows it's ordered", async () => {
      const ids = await seedFixtures(db);
      const order = await createOrder(checkoutInput(ids, { lines: [{ variantId: defaultVariantId, quantity: 1 }], expectedTotal: "1000.00" }), { ip: "test" });
      if (!order.ok) throw new Error(`createOrder failed: ${order.error}`);
      const second = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      if (!second.ok) throw new Error("unreachable");

      const result = await actions.deleteVariantAction(null, form({ variantId: defaultVariantId }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Deactivate it instead/);
      expect(await variantsOf(productId)).toHaveLength(2);

      const panel = await variantsService.getPanelVariants(productId);
      expect(panel.find((variant) => variant.id === defaultVariantId)?.ordered).toBe(true);
      expect(panel.find((variant) => variant.id === second.id)?.ordered).toBe(false);

      // Deactivating it is the offered way out, and works since another active variant exists.
      expect(await actions.setVariantActiveAction(null, form({ variantId: defaultVariantId, isActive: "false" }))).toMatchObject({ ok: true });
    });

    it("deletes an unordered variant, renumbers the rest and writes variant.delete", async () => {
      const second = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      const third = await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-BLUE-L", attributeValue0: "Blue" }) }));
      if (!second.ok || !third.ok) throw new Error("unreachable");

      const result = await actions.deleteVariantAction(null, form({ variantId: second.id! }));
      expect(result.ok).toBe(true);
      const rows = await variantsOf(productId);
      expect(rows.map((row) => row.id)).toEqual([defaultVariantId, third.id]);
      expect(rows.map((row) => row.sortOrder)).toEqual([0, 1]);
      expect(await variantAuditRows(second.id!, "variant.delete")).toHaveLength(1);
    });
  });

  describe("reorder", () => {
    it("saveVariantOrderAction writes dense positions with no duplicates and one variant.sort_change row", async () => {
      const second = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      const third = await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-BLUE-L", attributeValue0: "Blue" }) }));
      if (!second.ok || !third.ok) throw new Error("unreachable");

      const result = await actions.saveVariantOrderAction({ productId, orderedIds: [third.id!, defaultVariantId, second.id!] });
      expect(result).toMatchObject({ ok: true });

      const rows = await variantsOf(productId);
      expect(rows.map((row) => row.id)).toEqual([third.id, defaultVariantId, second.id]);
      expect(rows.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
      expect(await orderAuditRows(productId)).toHaveLength(1);

      // The storefront picker follows the same order.
      const detail = await storefront.getProductDetail("linen-napkin");
      expect(detail?.variants.map((variant) => variant.id)).toEqual([third.id, defaultVariantId, second.id]);
    });

    it("saveVariantOrderAction refuses a stale or foreign id set and invalid input at the boundary", async () => {
      const second = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      if (!second.ok) throw new Error("unreachable");

      expect(await actions.saveVariantOrderAction({ productId, orderedIds: [defaultVariantId] })).toMatchObject({ ok: false });
      expect(await actions.saveVariantOrderAction({ productId, orderedIds: [defaultVariantId, second.id!, 999999] })).toMatchObject({ ok: false });
      expect(await actions.saveVariantOrderAction({ productId, orderedIds: [defaultVariantId, defaultVariantId] })).toMatchObject({ ok: false });
      expect(await actions.saveVariantOrderAction({ productId: -1, orderedIds: [] })).toMatchObject({ ok: false });
      expect((await variantsOf(productId)).map((row) => row.sortOrder)).toEqual([0, 1]);
    });

    it("moveVariantAction moves one row to the top / a position", async () => {
      const second = await actions.createVariantAction(null, form({ productId, ...variantForm() }));
      const third = await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-BLUE-L", attributeValue0: "Blue" }) }));
      if (!second.ok || !third.ok) throw new Error("unreachable");

      expect(await actions.moveVariantAction(null, form({ variantId: third.id!, placement: "top" }))).toMatchObject({ ok: true });
      expect((await variantsOf(productId)).map((row) => row.id)).toEqual([third.id, defaultVariantId, second.id]);

      expect(await actions.moveVariantAction(null, form({ variantId: third.id!, placement: "position", position: "2" }))).toMatchObject({ ok: true });
      expect((await variantsOf(productId)).map((row) => row.id)).toEqual([defaultVariantId, third.id, second.id]);
      expect(await orderAuditRows(productId)).toHaveLength(2);
    });
  });

  describe("storefront", () => {
    it("the shop card shows the cheapest active variant's price with 'From' when variants differ", async () => {
      await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-CHEAP", priceOverride: "800", attributeValue0: "Blue" }) }));
      await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-DEAR", priceOverride: "1500", attributeValue0: "Gold" }) }));
      // An inactive bargain never sets the card price.
      await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-HIDDEN", priceOverride: "100", attributeValue0: "Grey", isActive: "false" }) }));

      const listing = await storefront.listProducts({ category: null, nameQuery: null, sort: "newest", page: 1 });
      const card = listing.cards.find((item) => item.slug === "linen-napkin");
      expect(card?.price.amount).toBe("PKR 800");
      expect(card?.priceFrom).toBe(true);
      expect(card?.singleVariant).toBeNull();
    });

    it("a lone variant shows no 'From' and the card can add it directly", async () => {
      const listing = await storefront.listProducts({ category: null, nameQuery: null, sort: "newest", page: 1 });
      const card = listing.cards.find((item) => item.slug === "linen-napkin");
      expect(card?.priceFrom).toBe(false);
      expect(card?.singleVariant).toEqual({ id: defaultVariantId, soldOut: false });
    });

    it("the product page shows only active variants, each with its own override price and stock state", async () => {
      const red = await actions.createVariantAction(null, form({ productId, ...variantForm({ priceOverride: "1200", stock: "0" }) }));
      const hidden = await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-HIDDEN", attributeValue0: "Grey", isActive: "false" }) }));
      if (!red.ok || !hidden.ok) throw new Error("unreachable");

      const detail = await storefront.getProductDetail("linen-napkin");
      expect(detail?.variants.map((variant) => variant.id)).toEqual([defaultVariantId, red.id]);
      expect(detail?.variants.map((variant) => variant.id)).not.toContain(hidden.id);
      expect(detail?.variants[0]).toMatchObject({ price: { amount: "PKR 1,000" }, stockState: "in_stock" });
      expect(detail?.variants[1]).toMatchObject({ label: "Red / Large", price: { amount: "PKR 1,200" }, stockState: "sold_out", stock: 0 });

      // Deactivating the red one through the panel removes it from the picker on the next read.
      await actions.setVariantActiveAction(null, form({ variantId: red.id!, isActive: "false" }));
      const after = await storefront.getProductDetail("linen-napkin");
      expect(after?.variants.map((variant) => variant.id)).toEqual([defaultVariantId]);
    });

    it("the products list's stock column sums active variants only", async () => {
      await actions.createVariantAction(null, form({ productId, ...variantForm({ stock: "7" }) }));
      await actions.createVariantAction(null, form({ productId, ...variantForm({ sku: "VAR-OFF", stock: "100", attributeValue0: "Grey", isActive: "false" }) }));
      const list = await productsService.listStaffProducts("all", { page: 1, pageSize: 25 });
      expect(list.items.find((item) => item.id === productId)?.stock).toBe(17);
    });
  });

  describe("RBAC", () => {
    it("a Developer session can open the edit page", async () => {
      await expect(EditProductPage({ params: Promise.resolve({ id: String(productId) }), searchParams: Promise.resolve({}) })).resolves.toBeDefined();
    });

    it("an Admin session is refused on the edit page and every variant Server Action", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => EditProductPage({ params: Promise.resolve({ id: String(productId) }), searchParams: Promise.resolve({}) }), "/panel/403");
      await expectRedirectTo(() => actions.createVariantAction(null, form({ productId, ...variantForm() })), "/panel/403");
      await expectRedirectTo(() => actions.updateVariantAction(null, form({ variantId: defaultVariantId, ...variantForm() })), "/panel/403");
      await expectRedirectTo(() => actions.setVariantStockAction(null, form({ variantId: defaultVariantId, stock: "1" })), "/panel/403");
      await expectRedirectTo(() => actions.setVariantActiveAction(null, form({ variantId: defaultVariantId, isActive: "false" })), "/panel/403");
      await expectRedirectTo(() => actions.deleteVariantAction(null, form({ variantId: defaultVariantId })), "/panel/403");
      await expectRedirectTo(() => actions.moveVariantAction(null, form({ variantId: defaultVariantId, placement: "top" })), "/panel/403");
      await expectRedirectTo(() => actions.saveVariantOrderAction({ productId, orderedIds: [defaultVariantId] }), "/panel/403");
      expect(await variantsOf(productId)).toHaveLength(1);
    });

    it("a session with product.view but not product.update is refused", async () => {
      await signInAs([PERMISSIONS.PRODUCT_VIEW]);
      await expectRedirectTo(() => actions.createVariantAction(null, form({ productId, ...variantForm() })), "/panel/403");
      await expectRedirectTo(() => actions.saveVariantOrderAction({ productId, orderedIds: [defaultVariantId] }), "/panel/403");
    });
  });
});
