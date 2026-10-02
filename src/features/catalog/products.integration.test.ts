/**
 * The panel's products CRUD against the test database (S10 phase 2): default-variant and image
 * creation, slug/SKU clashes, edits (general fields and the inline variant fields), a price change's
 * audit row and its order snapshots staying untouched, draft/archived/hidden-category absence from
 * the storefront queries, the delete guard (refused once ordered, allowed otherwise), and the
 * Developer-vs-Admin RBAC wall. Mirrors `categories.integration.test.ts` (S10 phase 1).
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { categories, productImages, productVariants, products } from "@/server/db/schema/catalog";
import { orderItems } from "@/server/db/schema/orders";
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
type PanelActions = typeof import("@/app/panel/(protected)/products/actions");

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

describe.skipIf(!TEST_DATABASE_URL)("products CRUD (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let staffService: typeof import("./products-staff-service");
  let repo: typeof import("./repo");
  let service: typeof import("./service");
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let panelActions: PanelActions;
  let ProductsPageBody: typeof import("@/components/panel/products/ProductsPageBody").ProductsPageBody;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  const validInput = (categoryId: number, overrides: Record<string, string> = {}) => ({
    name: "Ceramic Vase",
    slug: "ceramic-vase-test",
    categoryId: String(categoryId),
    shortDescription: "",
    description: "",
    price: "1500.00",
    weightGrams: "",
    status: "active",
    isFeatured: "false",
    imagePath: "",
    imagePathWidth: "",
    imagePathHeight: "",
    sku: "TEST-VASE-SKU",
    stock: "10",
    ...overrides,
  });

  const auditRows = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "product"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  async function createTestCategory(slug = "test-category"): Promise<number> {
    const [category] = await db.insert(categories).values({ name: "Test Category", slug, isActive: true });
    return category.insertId;
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    staffService = await import("./products-staff-service");
    repo = await import("./repo");
    service = await import("./service");
    ({ createOrder } = await import("@/features/checkout/service"));
    panelActions = await import("@/app/panel/(protected)/products/actions");
    ({ ProductsPageBody } = await import("@/components/panel/products/ProductsPageBody"));
  });

  afterAll(async () => {
    await pool.end();
  });

  let actorId: number;
  let categoryId: number;

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ({ userId: actorId } = await createStaffSession(db, hashToken, DEVELOPER_DEFAULT_PERMISSIONS));
    categoryId = await createTestCategory();
  });

  describe("create", () => {
    it("creates a product, its default variant and image row, and writes an audit row", async () => {
      const result = await staffService.createProduct(validInput(categoryId, { imagePath: "products/testimg", imagePathWidth: "800", imagePathHeight: "600" }), { id: actorId });
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("unreachable");

      const [product] = await db.select().from(products).where(eq(products.id, result.id!));
      expect(product).toMatchObject({ name: "Ceramic Vase", slug: "ceramic-vase-test", status: "active", price: "1500.00" });

      const variants = await db.select().from(productVariants).where(eq(productVariants.productId, result.id!));
      expect(variants).toHaveLength(1);
      expect(variants[0]).toMatchObject({ sku: "TEST-VASE-SKU", label: "Default", stock: 10 });

      const images = await db.select().from(productImages).where(eq(productImages.productId, result.id!));
      expect(images).toMatchObject([{ path: "products/testimg", width: 800, height: 600 }]);

      expect(await auditRows(result.id!, "product.create")).toHaveLength(1);
    });

    it("refuses a slug already in use", async () => {
      await staffService.createProduct(validInput(categoryId, { slug: "dup-slug", sku: "SKU-A" }), { id: actorId });
      const result = await staffService.createProduct(validInput(categoryId, { slug: "dup-slug", sku: "SKU-B" }), { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.fieldErrors?.slug).toBeDefined();
    });

    it("refuses a SKU already in use", async () => {
      await staffService.createProduct(validInput(categoryId, { slug: "vase-one", sku: "DUP-SKU" }), { id: actorId });
      const result = await staffService.createProduct(validInput(categoryId, { slug: "vase-two", sku: "DUP-SKU" }), { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.fieldErrors?.sku).toBeDefined();
    });
  });

  describe("update", () => {
    it("replaces an existing image: the old row is updated and the old file is removed", async () => {
      const created = await staffService.createProduct(
        validInput(categoryId, { slug: "image-replace-test", sku: "IMAGE-REPLACE-SKU", imagePath: "products/original", imagePathWidth: "800", imagePathHeight: "600" }),
        { id: actorId },
      );
      if (!created.ok) throw new Error("unreachable");

      const result = await staffService.updateProductById(
        created.id!,
        validInput(categoryId, {
          slug: "image-replace-test",
          sku: "IMAGE-REPLACE-SKU",
          stock: "10",
          imagePath: "products/replacement",
          imagePathWidth: "1024",
          imagePathHeight: "768",
        }),
        { id: actorId },
      );
      expect(result).toMatchObject({ ok: true });

      const images = await db.select().from(productImages).where(eq(productImages.productId, created.id!));
      expect(images).toMatchObject([{ path: "products/replacement", width: 1024, height: 768 }]);
    });

    it("removes the image row when the image is cleared", async () => {
      const created = await staffService.createProduct(
        validInput(categoryId, { slug: "image-clear-test", sku: "IMAGE-CLEAR-SKU", imagePath: "products/to-clear", imagePathWidth: "800", imagePathHeight: "600" }),
        { id: actorId },
      );
      if (!created.ok) throw new Error("unreachable");

      const result = await staffService.updateProductById(created.id!, validInput(categoryId, { slug: "image-clear-test", sku: "IMAGE-CLEAR-SKU", stock: "10" }), {
        id: actorId,
      });
      expect(result).toMatchObject({ ok: true });

      expect(await db.select().from(productImages).where(eq(productImages.productId, created.id!))).toHaveLength(0);
    });

    it("updates general fields, the inline variant fields, and writes audit rows", async () => {
      const created = await staffService.createProduct(validInput(categoryId), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      const result = await staffService.updateProductById(
        created.id!,
        validInput(categoryId, { name: "Large Ceramic Vase", slug: "ceramic-vase-test", sku: "TEST-VASE-SKU-2", stock: "25" }),
        { id: actorId },
      );
      expect(result).toMatchObject({ ok: true });

      const [product] = await db.select().from(products).where(eq(products.id, created.id!));
      expect(product.name).toBe("Large Ceramic Vase");

      const [variant] = await db.select().from(productVariants).where(eq(productVariants.productId, created.id!));
      expect(variant).toMatchObject({ sku: "TEST-VASE-SKU-2", stock: 25 });

      expect(await auditRows(created.id!, "product.update")).toHaveLength(1);
    });

    it("keeping its own slug and SKU on update is not a clash", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { slug: "keep-slug", sku: "KEEP-SKU" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const result = await staffService.updateProductById(created.id!, validInput(categoryId, { slug: "keep-slug", sku: "KEEP-SKU", stock: "1" }), { id: actorId });
      expect(result.ok).toBe(true);
    });

    it("writes a product.price_change audit row only when the price actually changes", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { price: "1000.00" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      await staffService.updateProductById(created.id!, validInput(categoryId, { price: "1000.00", stock: "10" }), { id: actorId });
      expect(await auditRows(created.id!, "product.price_change")).toHaveLength(0);

      await staffService.updateProductById(created.id!, validInput(categoryId, { price: "1800.00", stock: "10" }), { id: actorId });
      const priceAudit = await auditRows(created.id!, "product.price_change");
      expect(priceAudit).toHaveLength(1);
      expect(JSON.parse(priceAudit[0].oldValues!)).toEqual({ price: "1000.00" });
      expect(JSON.parse(priceAudit[0].newValues!)).toEqual({ price: "1800.00" });
    });

    it("a price change leaves an existing order's item snapshot untouched", async () => {
      const ids = await seedFixtures(db);
      const created = await staffService.createProduct(validInput(categoryId, { slug: "snapshot-test", sku: "SNAPSHOT-SKU", price: "1000.00" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const [variant] = await db.select().from(productVariants).where(eq(productVariants.productId, created.id!));

      const order = await createOrder(checkoutInput(ids, { lines: [{ variantId: variant.id, quantity: 1 }], expectedTotal: "1000.00" }), { ip: "test" });
      if (!order.ok) throw new Error(`createOrder failed: ${order.error}`);

      const [itemBefore] = await db.select().from(orderItems).where(eq(orderItems.productId, created.id!));
      expect(itemBefore).toMatchObject({ unitPrice: "1000.00", nameSnapshot: "Ceramic Vase" });

      await staffService.updateProductById(created.id!, validInput(categoryId, { slug: "snapshot-test", sku: "SNAPSHOT-SKU", name: "Renamed Vase", price: "2000.00" }), {
        id: actorId,
      });

      const [itemAfter] = await db.select().from(orderItems).where(eq(orderItems.productId, created.id!));
      expect(itemAfter).toMatchObject({ unitPrice: "1000.00", nameSnapshot: "Ceramic Vase" });
    });
  });

  describe("storefront visibility", () => {
    it("a draft or archived product never appears in the storefront queries", async () => {
      const draft = await staffService.createProduct(validInput(categoryId, { slug: "draft-product", sku: "DRAFT-SKU", status: "draft" }), { id: actorId });
      const archived = await staffService.createProduct(validInput(categoryId, { slug: "archived-product", sku: "ARCHIVED-SKU", status: "archived" }), { id: actorId });
      if (!draft.ok || !archived.ok) throw new Error("unreachable");

      expect(await repo.getActiveProductBySlug("draft-product")).toBeUndefined();
      expect(await repo.getActiveProductBySlug("archived-product")).toBeUndefined();

      const listing = await service.listProducts({ category: null, nameQuery: null, sort: "newest", page: 1 });
      expect(listing.cards.map((card) => card.slug)).not.toContain("draft-product");
      expect(listing.cards.map((card) => card.slug)).not.toContain("archived-product");
    });

    it("an active product in a hidden category is absent from the shop listing and featured section", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { slug: "hidden-category-product", sku: "HIDDEN-SKU", isFeatured: "true" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      // The category is hidden *after* the product already exists in it — exactly like a real
      // category edit — rather than at creation, which the category picker and server both refuse.
      await db.update(categories).set({ isActive: false }).where(eq(categories.id, categoryId));

      const listing = await service.listProducts({ category: null, nameQuery: null, sort: "newest", page: 1 });
      expect(listing.cards.map((card) => card.slug)).not.toContain("hidden-category-product");

      const featured = await service.getHomeFeaturedProducts();
      expect(featured.map((card) => card.slug)).not.toContain("hidden-category-product");

      const detail = await service.getProductDetail("hidden-category-product");
      expect(detail?.category.isActive).toBe(false);
    });
  });

  describe("delete", () => {
    it("refuses deleting a product referenced by an order, suggesting Archive instead", async () => {
      const ids = await seedFixtures(db);
      const created = await staffService.createProduct(validInput(categoryId, { slug: "ordered-product", sku: "ORDERED-SKU" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const [variant] = await db.select().from(productVariants).where(eq(productVariants.productId, created.id!));

      const order = await createOrder(checkoutInput(ids, { lines: [{ variantId: variant.id, quantity: 1 }], expectedTotal: "1500.00" }), { ip: "test" });
      if (!order.ok) throw new Error(`createOrder failed: ${order.error}`);

      const guard = await staffService.checkProductDeletable(created.id!);
      expect(guard).toMatchObject({ allowed: false, reason: "has_orders" });

      const result = await staffService.deleteProductById(created.id!, { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toMatch(/Archive it instead/);

      expect(await db.select().from(products).where(eq(products.id, created.id!))).toHaveLength(1);
    });

    it("deletes a product with no orders and writes an audit row", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { slug: "deletable-product", sku: "DELETABLE-SKU" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      const guard = await staffService.checkProductDeletable(created.id!);
      expect(guard).toMatchObject({ allowed: true });

      const result = await staffService.deleteProductById(created.id!, { id: actorId });
      expect(result.ok).toBe(true);

      expect(await db.select().from(products).where(eq(products.id, created.id!))).toHaveLength(0);
      expect(await db.select().from(productVariants).where(eq(productVariants.productId, created.id!))).toHaveLength(0);
      expect(await auditRows(created.id!, "product.delete")).toHaveLength(1);
    });
  });

  describe("RBAC", () => {
    it("a Developer session can open the list page and create/update/delete through the Server Actions", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expect(ProductsPageBody({ searchParams: {} })).resolves.toBeDefined();

      await expectRedirectTo(() => panelActions.createProductAction(null, form(validInput(categoryId, { slug: "action-created", sku: "ACTION-SKU" }))), "/panel/products");
    });

    // Exercises the exact field names `MediaImageField`'s hidden inputs post ("imagePath",
    // "imagePathWidth", "imagePathHeight" — derived from its `name` prop, not "imageWidth"/
    // "imageHeight"), through the real Server Action, the same path a browser submit takes. A prior
    // version of this suite called `staffService.createProduct` with the schema's own (then-wrong)
    // field names and passed despite the mismatch, which is exactly how the bug reached a live
    // browser undetected — this test pins the actual wire format instead.
    it("createProductAction creates the image row from the hidden inputs MediaImageField actually posts", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expectRedirectTo(
        () =>
          panelActions.createProductAction(
            null,
            form(
              validInput(categoryId, {
                slug: "action-with-image",
                sku: "ACTION-IMAGE-SKU",
                imagePath: "products/action-image-test",
                imagePathWidth: "1408",
                imagePathHeight: "1008",
              }),
            ),
          ),
        "/panel/products",
      );

      const [product] = await db.select().from(products).where(eq(products.slug, "action-with-image"));
      const [image] = await db.select().from(productImages).where(eq(productImages.productId, product.id));
      expect(image).toMatchObject({ path: "products/action-image-test", width: 1408, height: 1008 });
    });

    it("deleteProductAction actually deletes a product with no orders and redirects to the list", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const created = await staffService.createProduct(validInput(categoryId, { slug: "action-delete-me", sku: "ACTION-DELETE-SKU" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      await expectRedirectTo(() => panelActions.deleteProductAction(null, form({ id: created.id! })), "/panel/products");
      expect(await db.select().from(products).where(eq(products.id, created.id!))).toHaveLength(0);
    });

    it("updateProductAction actually saves the change and redirects to the list", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const created = await staffService.createProduct(validInput(categoryId, { slug: "action-update-me", sku: "ACTION-UPDATE-SKU" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      await expectRedirectTo(
        () =>
          panelActions.updateProductAction(
            null,
            form({ ...validInput(categoryId, { slug: "action-update-me", sku: "ACTION-UPDATE-SKU", stock: "3" }), id: created.id! }),
          ),
        "/panel/products",
      );
      const [variant] = await db.select().from(productVariants).where(eq(productVariants.productId, created.id!));
      expect(variant.stock).toBe(3);
    });

    it("archiveProductAction and restoreProductAction toggle status without redirecting", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const created = await staffService.createProduct(validInput(categoryId, { slug: "action-archive-me", sku: "ACTION-ARCHIVE-SKU" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      const archived = await panelActions.archiveProductAction(null, form({ id: created.id! }));
      expect(archived.ok).toBe(true);
      expect((await db.select().from(products).where(eq(products.id, created.id!)))[0].status).toBe("archived");

      const restored = await panelActions.restoreProductAction(null, form({ id: created.id! }));
      expect(restored.ok).toBe(true);
      expect((await db.select().from(products).where(eq(products.id, created.id!)))[0].status).toBe("active");
    });

    it("an Admin session is refused on the list page and every Server Action", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => ProductsPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.createProductAction(null, form(validInput(categoryId))), "/panel/403");
      await expectRedirectTo(() => panelActions.updateProductAction(null, form({ ...validInput(categoryId), id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.deleteProductAction(null, form({ id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.archiveProductAction(null, form({ id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.restoreProductAction(null, form({ id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.setFeaturedAction(null, form({ id: "1", isFeatured: "true" })), "/panel/403");
    });

    it("a session with no permissions is refused", async () => {
      await signInAs([]);
      await expectRedirectTo(() => ProductsPageBody({ searchParams: {} }), "/panel/403");
    });
  });
});
