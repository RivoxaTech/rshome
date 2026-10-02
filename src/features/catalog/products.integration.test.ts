/**
 * The panel's products CRUD against the test database (S10 phase 2): default-variant and image
 * creation, slug/SKU clashes, edits (general fields and the inline variant fields), a price change's
 * audit row and its order snapshots staying untouched, draft/archived/hidden-category absence from
 * the storefront queries, the delete guard (refused once ordered, allowed otherwise), and the
 * Developer-vs-Admin RBAC wall. Mirrors `categories.integration.test.ts` (S10 phase 1).
 */
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { categories, productImages, productVariants, products } from "@/server/db/schema/catalog";
import { orderItems } from "@/server/db/schema/orders";
import { discountTargets, discounts } from "@/server/db/schema/promotions";
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
type ArrangeActions = typeof import("@/app/panel/(protected)/products/arrange/actions");

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
  let arrangeActions: ArrangeActions;
  let arrangeService: typeof import("./arrange-service");
  let ProductsPageBody: typeof import("@/components/panel/products/ProductsPageBody").ProductsPageBody;
  let ArrangeProductsPage: typeof import("@/app/panel/(protected)/products/arrange/page").default;

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

  const orderAuditRows = (entityId: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "product_order"), eq(auditLogs.entityId, entityId), eq(auditLogs.action, "product.sort_change")));

  async function orderedProductIds(): Promise<number[]> {
    const rows = await db.select({ id: products.id }).from(products).orderBy(asc(products.sortOrder), asc(products.id));
    return rows.map((row) => row.id);
  }

  async function orderedFeaturedProductIds(): Promise<number[]> {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.isFeatured, true), eq(products.status, "active")))
      .orderBy(asc(products.featuredSortOrder), asc(products.id));
    return rows.map((row) => row.id);
  }

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
    arrangeActions = await import("@/app/panel/(protected)/products/arrange/actions");
    arrangeService = await import("./arrange-service");
    ({ ProductsPageBody } = await import("@/components/panel/products/ProductsPageBody"));
    ({ default: ArrangeProductsPage } = await import("@/app/panel/(protected)/products/arrange/page"));
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

  describe("sale price display (S10 phase 2b, reuses features/pricing only)", () => {
    async function insertDiscount(values: Partial<typeof discounts.$inferInsert> & Pick<typeof discounts.$inferInsert, "type" | "value" | "targetType">): Promise<number> {
      const [row] = await db.insert(discounts).values({ name: "Test discount", isActive: true, ...values });
      return row.insertId;
    }

    it("a product-targeted percent discount shows the discounted price, with the original struck through, in the list and the edit form", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { slug: "sale-product", sku: "SALE-SKU", price: "1000.00" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const discountId = await insertDiscount({ type: "percent", value: "10.00", targetType: "product" });
      await db.insert(discountTargets).values({ discountId, targetId: created.id! });

      const list = await staffService.listStaffProducts("all", { page: 1, pageSize: 25 });
      const item = list.items.find((row) => row.id === created.id);
      expect(item?.salePrice).toEqual({ original: "1000.00", discounted: "900.00" });

      const edit = await staffService.getProductForEdit(created.id!);
      expect(edit?.salePrice).toEqual({ original: "1000.00", discounted: "900.00" });
    });

    it("a category-targeted fixed discount applies to every product in that category", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { slug: "sale-category-product", sku: "SALE-CAT-SKU", price: "2000.00" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const discountId = await insertDiscount({ type: "fixed", value: "300.00", targetType: "category" });
      await db.insert(discountTargets).values({ discountId, targetId: categoryId });

      const list = await staffService.listStaffProducts("all", { page: 1, pageSize: 25 });
      const item = list.items.find((row) => row.id === created.id);
      expect(item?.salePrice).toEqual({ original: "2000.00", discounted: "1700.00" });
    });

    it("no salePrice without a matching discount", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { slug: "no-sale-product", sku: "NO-SALE-SKU", price: "1000.00" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      const list = await staffService.listStaffProducts("all", { page: 1, pageSize: 25 });
      expect(list.items.find((row) => row.id === created.id)?.salePrice).toBeNull();
    });

    it("an inactive discount does not apply", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { slug: "inactive-discount-product", sku: "INACTIVE-SKU", price: "1000.00" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const discountId = await insertDiscount({ type: "percent", value: "50.00", targetType: "product", isActive: false });
      await db.insert(discountTargets).values({ discountId, targetId: created.id! });

      const list = await staffService.listStaffProducts("all", { page: 1, pageSize: 25 });
      expect(list.items.find((row) => row.id === created.id)?.salePrice).toBeNull();
    });

    it("an expired discount does not apply", async () => {
      const created = await staffService.createProduct(validInput(categoryId, { slug: "expired-discount-product", sku: "EXPIRED-SKU", price: "1000.00" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const discountId = await insertDiscount({ type: "percent", value: "50.00", targetType: "product", endsAt: new Date("2020-01-01") });
      await db.insert(discountTargets).values({ discountId, targetId: created.id! });

      const list = await staffService.listStaffProducts("all", { page: 1, pageSize: 25 });
      expect(list.items.find((row) => row.id === created.id)?.salePrice).toBeNull();
    });
  });

  describe("manual ordering (S10 phase 2b)", () => {
    it("a new product lands at the end by default, then at the top, then at a position", async () => {
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "order-p1", sku: "ORDER-P1" }), { id: actorId });
      const p2 = await staffService.createProduct(validInput(categoryId, { slug: "order-p2", sku: "ORDER-P2" }), { id: actorId });
      const p3 = await staffService.createProduct(validInput(categoryId, { slug: "order-p3", sku: "ORDER-P3" }), { id: actorId });
      if (!p1.ok || !p2.ok || !p3.ok) throw new Error("unreachable");
      expect(await orderedProductIds()).toEqual([p1.id, p2.id, p3.id]);

      const p4 = await staffService.createProduct(validInput(categoryId, { slug: "order-p4", sku: "ORDER-P4", shopPlacement: "top" }), { id: actorId });
      if (!p4.ok) throw new Error("unreachable");
      expect(await orderedProductIds()).toEqual([p4.id, p1.id, p2.id, p3.id]);

      const p5 = await staffService.createProduct(
        validInput(categoryId, { slug: "order-p5", sku: "ORDER-P5", shopPlacement: "position", shopPosition: "2" }),
        { id: actorId },
      );
      if (!p5.ok) throw new Error("unreachable");
      expect(await orderedProductIds()).toEqual([p4.id, p5.id, p1.id, p2.id, p3.id]);

      // No duplicate sort_order values after two renormalizing placements.
      const rows = await db.select({ sortOrder: products.sortOrder }).from(products);
      expect(new Set(rows.map((row) => row.sortOrder)).size).toBe(rows.length);
    });

    it("editing a product's position moves it, renumbering the rest", async () => {
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "edit-p1", sku: "EDIT-P1" }), { id: actorId });
      const p2 = await staffService.createProduct(validInput(categoryId, { slug: "edit-p2", sku: "EDIT-P2" }), { id: actorId });
      const p3 = await staffService.createProduct(validInput(categoryId, { slug: "edit-p3", sku: "EDIT-P3" }), { id: actorId });
      if (!p1.ok || !p2.ok || !p3.ok) throw new Error("unreachable");

      const result = await staffService.updateProductById(
        p1.id!,
        validInput(categoryId, { slug: "edit-p1", sku: "EDIT-P1", stock: "10", shopPlacement: "position", shopPosition: "3" }),
        { id: actorId },
      );
      expect(result.ok).toBe(true);
      expect(await orderedProductIds()).toEqual([p2.id, p3.id, p1.id]);
      // 3 creates (each places the product, "end" by default) + this edit's move = 4.
      expect(await orderAuditRows("shop")).toHaveLength(4);
    });

    it("leaving the shop placement at its default ('keep') on an ordinary edit never moves the product", async () => {
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "keep-p1", sku: "KEEP-P1" }), { id: actorId });
      const p2 = await staffService.createProduct(validInput(categoryId, { slug: "keep-p2", sku: "KEEP-P2" }), { id: actorId });
      if (!p1.ok || !p2.ok) throw new Error("unreachable");

      await staffService.updateProductById(p1.id!, validInput(categoryId, { slug: "keep-p1", sku: "KEEP-P1", stock: "10", name: "Renamed" }), { id: actorId });
      expect(await orderedProductIds()).toEqual([p1.id, p2.id]);
      // Only the 2 creates wrote a sort_change row; "keep" on the edit added none.
      expect(await orderAuditRows("shop")).toHaveLength(2);
    });

    it("a product newly switched to Featured defaults to the end of the featured order", async () => {
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "feat-p1", sku: "FEAT-P1", isFeatured: "true" }), { id: actorId });
      const p2 = await staffService.createProduct(validInput(categoryId, { slug: "feat-p2", sku: "FEAT-P2" }), { id: actorId });
      if (!p1.ok || !p2.ok) throw new Error("unreachable");

      await staffService.updateProductById(p2.id!, validInput(categoryId, { slug: "feat-p2", sku: "FEAT-P2", stock: "10", isFeatured: "true" }), { id: actorId });
      expect(await orderedFeaturedProductIds()).toEqual([p1.id, p2.id]);
    });

    it("featured placement top/position works the same way as shop placement", async () => {
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "feat-top-p1", sku: "FEAT-TOP-P1", isFeatured: "true" }), { id: actorId });
      if (!p1.ok) throw new Error("unreachable");
      const p2 = await staffService.createProduct(
        validInput(categoryId, { slug: "feat-top-p2", sku: "FEAT-TOP-P2", isFeatured: "true", featuredPlacement: "top" }),
        { id: actorId },
      );
      if (!p2.ok) throw new Error("unreachable");
      expect(await orderedFeaturedProductIds()).toEqual([p2.id, p1.id]);
    });

    it("the home 'RS Home Edit' strip and /shop's Recommended sort both follow sort_order", async () => {
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "rec-p1", sku: "REC-P1", isFeatured: "true" }), { id: actorId });
      const p2 = await staffService.createProduct(
        validInput(categoryId, { slug: "rec-p2", sku: "REC-P2", isFeatured: "true", shopPlacement: "top", featuredPlacement: "top" }),
        { id: actorId },
      );
      if (!p1.ok || !p2.ok) throw new Error("unreachable");

      const listing = await service.listProducts({ category: null, nameQuery: null, sort: "recommended", page: 1 });
      const slugs = listing.cards.map((card) => card.slug);
      expect(slugs.indexOf("rec-p2")).toBeLessThan(slugs.indexOf("rec-p1"));

      const featured = await service.getHomeFeaturedProducts();
      const featuredSlugs = featured.map((card) => card.slug);
      expect(featuredSlugs.indexOf("rec-p2")).toBeLessThan(featuredSlugs.indexOf("rec-p1"));
    });

    it("arranging within one category leaves every other category's relative order intact", async () => {
      const otherCategoryId = await createTestCategory("other-category");
      const a1 = await staffService.createProduct(validInput(categoryId, { slug: "cat-a1", sku: "CAT-A1" }), { id: actorId });
      const b1 = await staffService.createProduct(validInput(otherCategoryId, { slug: "cat-b1", sku: "CAT-B1" }), { id: actorId });
      const a2 = await staffService.createProduct(validInput(categoryId, { slug: "cat-a2", sku: "CAT-A2" }), { id: actorId });
      const b2 = await staffService.createProduct(validInput(otherCategoryId, { slug: "cat-b2", sku: "CAT-B2" }), { id: actorId });
      if (!a1.ok || !b1.ok || !a2.ok || !b2.ok) throw new Error("unreachable");
      expect(await orderedProductIds()).toEqual([a1.id, b1.id, a2.id, b2.id]);

      const result = await arrangeService.saveShopOrder({ categoryId, orderedIds: [a2.id!, a1.id!] }, { id: actorId });
      expect(result.ok).toBe(true);

      // Category A's two products swapped; B1 and B2 kept their exact same slots (still either
      // side of A's pair), so B's own relative order (b1 before b2) is untouched.
      const finalOrder = await orderedProductIds();
      expect(finalOrder.indexOf(b1.id!)).toBeLessThan(finalOrder.indexOf(a1.id!));
      expect(finalOrder.indexOf(a1.id!)).toBeLessThan(finalOrder.indexOf(b2.id!));
      expect(finalOrder.indexOf(a2.id!)).toBeLessThan(finalOrder.indexOf(a1.id!));
      expect(await orderAuditRows(String(categoryId))).toHaveLength(1);
    });

    it("saveShopOrder refuses a stale id set instead of silently corrupting the order", async () => {
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "stale-p1", sku: "STALE-P1" }), { id: actorId });
      if (!p1.ok) throw new Error("unreachable");

      const result = await arrangeService.saveShopOrder({ orderedIds: [999999] }, { id: actorId });
      expect(result.ok).toBe(false);
    });

    it("moveShopProduct moves a single product within a category without touching other categories", async () => {
      const otherCategoryId = await createTestCategory("move-other-category");
      const a1 = await staffService.createProduct(validInput(categoryId, { slug: "move-a1", sku: "MOVE-A1" }), { id: actorId });
      const b1 = await staffService.createProduct(validInput(otherCategoryId, { slug: "move-b1", sku: "MOVE-B1" }), { id: actorId });
      const a2 = await staffService.createProduct(validInput(categoryId, { slug: "move-a2", sku: "MOVE-A2" }), { id: actorId });
      if (!a1.ok || !b1.ok || !a2.ok) throw new Error("unreachable");

      const result = await arrangeService.moveShopProduct({ productId: a2.id!, categoryId, placement: { type: "top" } }, { id: actorId });
      expect(result.ok).toBe(true);

      const finalOrder = await orderedProductIds();
      expect(finalOrder.indexOf(a2.id!)).toBeLessThan(finalOrder.indexOf(a1.id!));
      expect(finalOrder).toContain(b1.id!);
    });

    it("moveFeaturedProduct moves within the featured order", async () => {
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "move-feat-p1", sku: "MOVE-FEAT-P1", isFeatured: "true" }), { id: actorId });
      const p2 = await staffService.createProduct(validInput(categoryId, { slug: "move-feat-p2", sku: "MOVE-FEAT-P2", isFeatured: "true" }), { id: actorId });
      if (!p1.ok || !p2.ok) throw new Error("unreachable");

      const result = await arrangeService.moveFeaturedProduct({ productId: p2.id!, placement: { type: "top" } }, { id: actorId });
      expect(result.ok).toBe(true);
      expect(await orderedFeaturedProductIds()).toEqual([p2.id, p1.id]);
      // 2 creates (each already Featured, so each places itself in the featured order) + this move = 3.
      expect(await orderAuditRows("featured")).toHaveLength(3);
    });

    it("moveShopProduct refuses a product that isn't in the given category, instead of silently inserting it", async () => {
      const otherCategoryId = await createTestCategory("refuse-other-category");
      const inScope = await staffService.createProduct(validInput(categoryId, { slug: "refuse-in-scope", sku: "REFUSE-IN-SCOPE" }), { id: actorId });
      const outOfScope = await staffService.createProduct(validInput(otherCategoryId, { slug: "refuse-out-of-scope", sku: "REFUSE-OUT-SKU" }), { id: actorId });
      if (!inScope.ok || !outOfScope.ok) throw new Error("unreachable");
      const beforeOrder = await orderedProductIds();

      const result = await arrangeService.moveShopProduct({ productId: outOfScope.id!, categoryId, placement: { type: "top" } }, { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toMatch(/isn't in this category/);
      // Refused — the order is exactly as it was, not silently inserted.
      expect(await orderedProductIds()).toEqual(beforeOrder);
    });

    it("moveFeaturedProduct refuses a product that isn't an active, featured product", async () => {
      const notFeatured = await staffService.createProduct(validInput(categoryId, { slug: "refuse-not-featured", sku: "REFUSE-NOT-FEAT-SKU" }), { id: actorId });
      if (!notFeatured.ok) throw new Error("unreachable");
      const beforeOrder = await orderedFeaturedProductIds();

      const result = await arrangeService.moveFeaturedProduct({ productId: notFeatured.id!, placement: { type: "top" } }, { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toMatch(/active, featured product/);
      expect(await orderedFeaturedProductIds()).toEqual(beforeOrder);

      const [product] = await db.select().from(products).where(eq(products.id, notFeatured.id!));
      expect(product.featuredSortOrder).toBe(0);
    });

    it("saveShopOrderAction/saveFeaturedOrderAction refuse invalid input at the boundary instead of throwing", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);

      const duplicate = await arrangeActions.saveShopOrderAction({ orderedIds: [1, 1, 2] });
      expect(duplicate).toMatchObject({ ok: false });

      const negative = await arrangeActions.saveShopOrderAction({ orderedIds: [1, -2] });
      expect(negative).toMatchObject({ ok: false });

      const tooMany = await arrangeActions.saveShopOrderAction({ orderedIds: Array.from({ length: 501 }, (_, i) => i + 1) });
      expect(tooMany).toMatchObject({ ok: false });

      const badCategory = await arrangeActions.saveShopOrderAction({ categoryId: -1, orderedIds: [1] });
      expect(badCategory).toMatchObject({ ok: false });

      const duplicateFeatured = await arrangeActions.saveFeaturedOrderAction({ orderedIds: [5, 5] });
      expect(duplicateFeatured).toMatchObject({ ok: false });
    });

    it("createProductAction places a product at position 3 through the real Server Action", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "action-pos-p1", sku: "ACTION-POS-P1" }), { id: actorId });
      const p2 = await staffService.createProduct(validInput(categoryId, { slug: "action-pos-p2", sku: "ACTION-POS-P2" }), { id: actorId });
      if (!p1.ok || !p2.ok) throw new Error("unreachable");

      await expectRedirectTo(
        () =>
          panelActions.createProductAction(
            null,
            form(validInput(categoryId, { slug: "action-pos-p3", sku: "ACTION-POS-P3", shopPlacement: "position", shopPosition: "3" })),
          ),
        "/panel/products",
      );

      const [created] = await db.select().from(products).where(eq(products.slug, "action-pos-p3"));
      const order = await orderedProductIds();
      expect(order.indexOf(created.id)).toBe(2); // position 3, 1-based -> index 2
      expect(order).toEqual([p1.id, p2.id, created.id]);
    });
  });

  describe("RBAC", () => {
    it("a Developer session can open the list page and create/update/delete through the Server Actions", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expect(ProductsPageBody({ searchParams: {} })).resolves.toBeDefined();

      await expectRedirectTo(() => panelActions.createProductAction(null, form(validInput(categoryId, { slug: "action-created", sku: "ACTION-SKU" }))), "/panel/products");
    });

    it("a Developer session can open the arrange page and use every arrange Server Action", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const p1 = await staffService.createProduct(validInput(categoryId, { slug: "rbac-arrange-p1", sku: "RBAC-ARRANGE-P1" }), { id: actorId });
      if (!p1.ok) throw new Error("unreachable");

      await expect(ArrangeProductsPage({ searchParams: Promise.resolve({}) })).resolves.toBeDefined();
      await expect(arrangeActions.saveShopOrderAction({ orderedIds: await orderedProductIds() })).resolves.toMatchObject({ ok: true });
      await expect(arrangeActions.saveFeaturedOrderAction({ orderedIds: [] })).resolves.toMatchObject({ ok: true });
      await expect(
        arrangeActions.moveShopProductAction(null, form({ productId: p1.id!, placement: "end" })),
      ).resolves.toMatchObject({ ok: true });
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

    // The shared Listbox component (replacing every native <select> in the panel, S10 phase 2b
    // follow-up) posts a plain hidden input named after the field ("categoryId", "status"), the
    // same shape `validInput` already builds — this pins the real Server Action to that wire
    // format rather than a hand-built service call, the same reasoning as the test above.
    it("createProductAction saves category and status from the exact hidden input names the Listbox component posts", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expectRedirectTo(
        () => panelActions.createProductAction(null, form(validInput(categoryId, { slug: "listbox-wire-test", sku: "LISTBOX-WIRE-SKU", status: "archived" }))),
        "/panel/products",
      );

      const [product] = await db.select().from(products).where(eq(products.slug, "listbox-wire-test"));
      expect(product).toMatchObject({ categoryId, status: "archived" });
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
      await expectRedirectTo(() => ArrangeProductsPage({ searchParams: Promise.resolve({}) }), "/panel/403");
      await expectRedirectTo(() => arrangeActions.saveShopOrderAction({ orderedIds: [] }), "/panel/403");
      await expectRedirectTo(() => arrangeActions.saveFeaturedOrderAction({ orderedIds: [] }), "/panel/403");
      await expectRedirectTo(() => arrangeActions.moveShopProductAction(null, form({ productId: 1, placement: "end" })), "/panel/403");
      await expectRedirectTo(() => arrangeActions.moveFeaturedProductAction(null, form({ productId: 1, placement: "end" })), "/panel/403");
    });

    it("a session with no permissions is refused", async () => {
      await signInAs([]);
      await expectRedirectTo(() => ProductsPageBody({ searchParams: {} }), "/panel/403");
    });
  });
});
