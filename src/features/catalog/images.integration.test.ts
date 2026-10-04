/**
 * The panel's product-images CRUD against the test database (S10): add (through the real
 * Server Action, uploaded-path shape only), the max-count and path-allowlist rules, duplicate-path
 * refusal, alt-text change with its audit row, reorder (dense positions, primary follows the first
 * position, a stale reorder refused), delete (renumbers, removes files), a whole-product delete
 * removing every image file, and the Developer-vs-Admin RBAC wall. Mirrors
 * `variants.integration.test.ts` (S10).
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { MAX_PRODUCT_IMAGES } from "@/features/catalog/schemas";
import { auditLogs } from "@/server/db/schema/audit";
import { categories, productImages, productVariants, products } from "@/server/db/schema/catalog";
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
type ImageActions = typeof import("@/app/panel/(protected)/products/[id]/actions");

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

describe.skipIf(!TEST_DATABASE_URL)("product images (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let productsService: typeof import("./products-staff-service");
  let imagesService: typeof import("./images-staff-service");
  let storefront: typeof import("./service");
  let actions: ImageActions;
  let EditProductPage: typeof import("@/app/panel/(protected)/products/[id]/page").default;
  let env: typeof import("@/server/env").env;
  let processMediaImage: typeof import("@/server/storage/images").processMediaImage;
  let statFile: typeof import("node:fs/promises").stat;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<{ userId: number }> {
    const { userId, token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
    return { userId };
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  /** A path shaped exactly like `processMediaImage`'s real output, with no file actually on disk — fine for every test except the real-file ones below. */
  const fakePath = () => `products/${randomBytes(16).toString("hex")}`;

  async function createTestProduct(slug = "image-test-product"): Promise<number> {
    const [category] = await db.insert(categories).values({ name: "Test Category", slug: `${slug}-cat`, isActive: true });
    const [product] = await db.insert(products).values({ categoryId: category.insertId, name: "Test Product", slug, price: "1000.00", status: "active" });
    await db.insert(productVariants).values({ productId: product.insertId, sku: `${slug}-SKU`, label: "Default", attributes: "{}", stock: 10 });
    return product.insertId;
  }

  const auditRows = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "product_image"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  async function orderedImageIds(productId: number): Promise<number[]> {
    const rows = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder), asc(productImages.id));
    return rows.map((row) => row.id);
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    productsService = await import("./products-staff-service");
    imagesService = await import("./images-staff-service");
    storefront = await import("./service");
    actions = await import("@/app/panel/(protected)/products/[id]/actions");
    ({ default: EditProductPage } = await import("@/app/panel/(protected)/products/[id]/page"));
    ({ env } = await import("@/server/env"));
    ({ processMediaImage } = await import("@/server/storage/images"));
    ({ stat: statFile } = await import("node:fs/promises"));
  });

  afterAll(async () => {
    await pool.end();
  });

  let actorId: number;
  let productId: number;

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ({ userId: actorId } = await createStaffSession(db, hashToken, DEVELOPER_DEFAULT_PERMISSIONS));
    productId = await createTestProduct();
  });

  describe("add", () => {
    it("addProductImage adds a row at the end and writes an audit row", async () => {
      const first = fakePath();
      const second = fakePath();
      const r1 = await imagesService.addProductImage(productId, { path: first, width: 800, height: 600 }, { id: actorId });
      expect(r1).toMatchObject({ ok: true });
      const r2 = await imagesService.addProductImage(productId, { path: second, width: 800, height: 600 }, { id: actorId });
      expect(r2).toMatchObject({ ok: true });

      const images = await db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder));
      expect(images.map((row) => row.path)).toEqual([first, second]);
      expect(await auditRows(r1.ok ? r1.id! : -1, "product.image_add")).toHaveLength(1);
    });

    it("refuses a 9th image with a clear message", async () => {
      for (let i = 0; i < MAX_PRODUCT_IMAGES; i++) {
        const result = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
        expect(result).toMatchObject({ ok: true });
      }
      const result = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      expect(result).toMatchObject({ ok: false });
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toContain(String(MAX_PRODUCT_IMAGES));

      expect(await db.select().from(productImages).where(eq(productImages.productId, productId))).toHaveLength(MAX_PRODUCT_IMAGES);
    });

    it("refuses a path that isn't the exact shape the upload route produces (traversal, absolute, URL, foreign folder, empty)", async () => {
      const badPaths = [
        "../../etc/passwd",
        "products/../../../etc/passwd",
        "/etc/passwd",
        "https://evil.example/x.webp",
        "proofs/" + randomBytes(16).toString("hex"), // another feature's folder
        "products/" + randomBytes(16).toString("hex").toUpperCase(), // uppercase hex refused
        "products/short",
        "",
      ];
      for (const badPath of badPaths) {
        const result = await imagesService.addProductImage(productId, { path: badPath, width: 800, height: 600 }, { id: actorId });
        expect(result, `expected "${badPath}" to be refused`).toMatchObject({ ok: false });
      }
      expect(await db.select().from(productImages).where(eq(productImages.productId, productId))).toHaveLength(0);
    });

    it("refuses a path already used by another row", async () => {
      const shared = fakePath();
      const first = await imagesService.addProductImage(productId, { path: shared, width: 800, height: 600 }, { id: actorId });
      expect(first).toMatchObject({ ok: true });

      const otherProductId = await createTestProduct("image-test-product-2");
      const second = await imagesService.addProductImage(otherProductId, { path: shared, width: 800, height: 600 }, { id: actorId });
      expect(second).toMatchObject({ ok: false });

      expect(await db.select().from(productImages).where(eq(productImages.productId, otherProductId))).toHaveLength(0);
    });

    it("addProductImageAction adds a row through the real Server Action, called directly with the uploader's payload shape", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const result = await actions.addProductImageAction(productId, { path: fakePath(), width: 800, height: 600 });
      expect(result).toMatchObject({ ok: true });
    });
  });

  describe("alt text", () => {
    it("setImageAlt saves a new value and writes an audit row with old and new", async () => {
      const added = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!added.ok) throw new Error("unreachable");

      const result = await imagesService.setImageAlt(added.id!, { alt: "A blue ceramic vase" }, { id: actorId });
      expect(result).toMatchObject({ ok: true });

      const [image] = await db.select().from(productImages).where(eq(productImages.id, added.id!));
      expect(image.alt).toBe("A blue ceramic vase");

      const rows = await auditRows(added.id!, "product.image_alt_change");
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0].newValues!)).toMatchObject({ alt: "A blue ceramic vase" });
      expect(JSON.parse(rows[0].oldValues!)).toMatchObject({ alt: null });
    });

    it("blank alt text is allowed and clears the field", async () => {
      const added = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!added.ok) throw new Error("unreachable");
      await imagesService.setImageAlt(added.id!, { alt: "Something" }, { id: actorId });

      const result = await imagesService.setImageAlt(added.id!, { alt: "" }, { id: actorId });
      expect(result).toMatchObject({ ok: true });
      const [image] = await db.select().from(productImages).where(eq(productImages.id, added.id!));
      expect(image.alt).toBeNull();
    });

    it("refuses alt text over 255 characters", async () => {
      const added = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!added.ok) throw new Error("unreachable");
      const result = await imagesService.setImageAlt(added.id!, { alt: "x".repeat(256) }, { id: actorId });
      expect(result).toMatchObject({ ok: false });
    });
  });

  describe("reorder", () => {
    it("saveImageOrder reorders, keeps positions dense, and the first position is primary", async () => {
      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const result = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
        if (!result.ok) throw new Error("unreachable");
        ids.push(result.id!);
      }
      const reordered = [ids[2], ids[0], ids[1]];
      const result = await imagesService.saveImageOrder({ productId, orderedIds: reordered }, { id: actorId });
      expect(result).toMatchObject({ ok: true });
      expect(await orderedImageIds(productId)).toEqual(reordered);

      const panelImages = await imagesService.getPanelImages(productId);
      expect(panelImages.map((image) => image.id)).toEqual(reordered);
      expect(panelImages[0]).toMatchObject({ position: 1, id: ids[2] });
    });

    it("refuses a stale or foreign id set", async () => {
      const result1 = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      const result2 = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!result1.ok || !result2.ok) throw new Error("unreachable");

      const stale = await imagesService.saveImageOrder({ productId, orderedIds: [result1.id!, result2.id!, 999_999] }, { id: actorId });
      expect(stale).toMatchObject({ ok: false });

      const missingOne = await imagesService.saveImageOrder({ productId, orderedIds: [result1.id!] }, { id: actorId });
      expect(missingOne).toMatchObject({ ok: false });

      // Neither refusal changed anything.
      expect(await orderedImageIds(productId)).toEqual([result1.id!, result2.id!]);
    });

    it("moveImage ('Make primary') moves an image to the top", async () => {
      const r1 = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      const r2 = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!r1.ok || !r2.ok) throw new Error("unreachable");

      const result = await imagesService.moveImage({ imageId: r2.id!, placement: { type: "top" } }, { id: actorId });
      expect(result).toMatchObject({ ok: true });
      expect(await orderedImageIds(productId)).toEqual([r2.id!, r1.id!]);
    });

    it("moveImageAction moves a row through the real Server Action", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const r1 = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      const r2 = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!r1.ok || !r2.ok) throw new Error("unreachable");

      const result = await actions.moveImageAction(null, form({ imageId: r2.id!, placement: "top" }));
      expect(result).toMatchObject({ ok: true });
      expect(await orderedImageIds(productId)).toEqual([r2.id!, r1.id!]);
    });
  });

  describe("delete", () => {
    it("deleteProductImage removes the row and renormalizes the remaining positions", async () => {
      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const result = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
        if (!result.ok) throw new Error("unreachable");
        ids.push(result.id!);
      }

      const result = await imagesService.deleteProductImage(ids[0], { id: actorId });
      expect(result).toMatchObject({ ok: true });

      const remaining = await db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder));
      expect(remaining.map((row) => row.id)).toEqual([ids[1], ids[2]]);
      expect(remaining.map((row) => row.sortOrder)).toEqual([0, 1]);
      expect(await auditRows(ids[0], "product.image_delete")).toHaveLength(1);
    });

    it("deletes the real WebP files on disk (all sizes) once the delete commits", async () => {
      const buffer = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 180, g: 120, b: 60 } } })
        .jpeg()
        .toBuffer();
      const processed = await processMediaImage(buffer, "products");
      const added = await imagesService.addProductImage(productId, processed, { id: actorId });
      if (!added.ok) throw new Error("unreachable");

      const filePath = (width: number) => path.join(env.UPLOAD_DIR, "media", `${processed.path}-${width}.webp`);
      await expect(statFile(filePath(400))).resolves.toBeDefined();

      const result = await imagesService.deleteProductImage(added.id!, { id: actorId });
      expect(result).toMatchObject({ ok: true });

      for (const width of [400, 800, 1200]) {
        await expect(statFile(filePath(width))).rejects.toThrow();
      }
    });

    it("deleting the whole product removes every one of its image files too", async () => {
      const buffer = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 60, g: 90, b: 160 } } })
        .jpeg()
        .toBuffer();
      const first = await processMediaImage(buffer, "products");
      const second = await processMediaImage(buffer, "products");
      const a1 = await imagesService.addProductImage(productId, first, { id: actorId });
      const a2 = await imagesService.addProductImage(productId, second, { id: actorId });
      if (!a1.ok || !a2.ok) throw new Error("unreachable");

      await productsService.deleteProductById(productId, { id: actorId });

      for (const processed of [first, second]) {
        for (const width of [400, 800, 1200]) {
          await expect(statFile(path.join(env.UPLOAD_DIR, "media", `${processed.path}-${width}.webp`))).rejects.toThrow();
        }
      }
      expect(await db.select().from(productImages).where(eq(productImages.productId, productId))).toHaveLength(0);
    });

    it("deleteProductImageAction removes a row through the real Server Action", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const added = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!added.ok) throw new Error("unreachable");

      const result = await actions.deleteProductImageAction(null, form({ imageId: added.id! }));
      expect(result).toMatchObject({ ok: true });
      expect(await db.select().from(productImages).where(eq(productImages.id, added.id!))).toHaveLength(0);
    });
  });

  describe("storefront", () => {
    it("the product page gallery shows every image in sort order, primary first", async () => {
      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const result = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
        if (!result.ok) throw new Error("unreachable");
        ids.push(result.id!);
      }
      await imagesService.saveImageOrder({ productId, orderedIds: [ids[2], ids[0], ids[1]] }, { id: actorId });

      const detail = await storefront.getProductDetail("image-test-product");
      const paths = (await db.select().from(productImages).where(eq(productImages.id, ids[2])))[0].path;
      expect(detail?.images[0].path).toBe(paths);
      expect(detail?.images).toHaveLength(3);
    });

    it("primary follows the first position: making a different image primary changes the shop card's image", async () => {
      const r1 = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      const r2 = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!r1.ok || !r2.ok) throw new Error("unreachable");

      const before = await storefront.listProducts({ category: null, nameQuery: null, sort: "newest", page: 1 });
      const [firstImage] = await db.select().from(productImages).where(eq(productImages.id, r1.id!));
      expect(before.cards.find((card) => card.slug === "image-test-product")?.image?.path).toBe(firstImage.path);

      await imagesService.moveImage({ imageId: r2.id!, placement: { type: "top" } }, { id: actorId });

      const after = await storefront.listProducts({ category: null, nameQuery: null, sort: "newest", page: 1 });
      const [secondImage] = await db.select().from(productImages).where(eq(productImages.id, r2.id!));
      expect(after.cards.find((card) => card.slug === "image-test-product")?.image?.path).toBe(secondImage.path);
    });

    it("a product with no images still renders: a null card image and an empty gallery, never a crash", async () => {
      const listing = await storefront.listProducts({ category: null, nameQuery: null, sort: "newest", page: 1 });
      expect(listing.cards.find((card) => card.slug === "image-test-product")?.image).toBeNull();

      const detail = await storefront.getProductDetail("image-test-product");
      expect(detail?.images).toEqual([]);
    });

    it("the gallery reads null alt (the component falls back to the product name) until staff set one", async () => {
      const added = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!added.ok) throw new Error("unreachable");

      const detail = await storefront.getProductDetail("image-test-product");
      expect(detail?.images[0].alt).toBeNull();

      await imagesService.setImageAlt(added.id!, { alt: "A hand-painted bowl" }, { id: actorId });
      const after = await storefront.getProductDetail("image-test-product");
      expect(after?.images[0].alt).toBe("A hand-painted bowl");
    });
  });

  describe("RBAC", () => {
    it("an Admin session is refused on the edit page and every image Server Action", async () => {
      const added = await imagesService.addProductImage(productId, { path: fakePath(), width: 800, height: 600 }, { id: actorId });
      if (!added.ok) throw new Error("unreachable");

      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => EditProductPage({ params: Promise.resolve({ id: String(productId) }), searchParams: Promise.resolve({}) }), "/panel/403");
      await expectRedirectTo(() => actions.addProductImageAction(productId, { path: fakePath(), width: 800, height: 600 }), "/panel/403");
      await expectRedirectTo(() => actions.setImageAltAction(null, form({ imageId: added.id!, alt: "x" })), "/panel/403");
      await expectRedirectTo(() => actions.moveImageAction(null, form({ imageId: added.id!, placement: "top" })), "/panel/403");
      await expectRedirectTo(() => actions.makeImagePrimaryAction(null, form({ imageId: added.id! })), "/panel/403");
      await expectRedirectTo(() => actions.deleteProductImageAction(null, form({ imageId: added.id! })), "/panel/403");
      await expectRedirectTo(() => actions.saveImageOrderAction({ productId, orderedIds: [added.id!] }), "/panel/403");
    });

    it("a session with no permissions is refused the same way", async () => {
      await signInAs([]);
      await expectRedirectTo(() => actions.addProductImageAction(productId, { path: fakePath(), width: 800, height: 600 }), "/panel/403");
    });
  });
});
