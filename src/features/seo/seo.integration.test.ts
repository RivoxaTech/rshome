/**
 * The SEO surface against the test database (S19): `app/sitemap.ts`'s default export reflecting
 * real catalogue visibility (an active product present, gone once draft or once its category is
 * hidden, a content page and `/wholesale` always present), `getProductDetail(...).seo` reflecting a
 * real discount's price and a real stock change, and the Contact page's data source
 * (`getContactInfo()`) reflecting a change saved through the real bank-settings Server Action
 * (mirrors `settings.integration.test.ts`'s own setup for that). Skips without TEST_DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS } from "@/features/auth/permissions";
import { categories, products } from "@/server/db/schema/catalog";
import { assertTestDatabase, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const sendMail = vi.hoisted(() => vi.fn());
const isMailConfigured = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/server/mail/transport", () => ({ sendMail, isMailConfigured }));
vi.mock("@/server/notify/push", () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }) }));

type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("SEO surface (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let sitemap: typeof import("@/app/sitemap").default;
  let catalogService: typeof import("@/features/catalog/service");
  let discountsStaff: typeof import("@/features/discounts/staff-service");
  let variantsStaff: typeof import("@/features/catalog/variants-staff-service");
  let settingsActions: typeof import("@/app/panel/(protected)/settings/actions");
  let settingsStaff: typeof import("@/features/settings/staff-service");
  let settingsReaders: typeof import("@/features/settings/service");

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  async function signInAs(permissionKeys: string[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  async function plateProductId(): Promise<number> {
    const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, "test-plate"));
    return row.id;
  }

  async function tablewareCategoryId(): Promise<number> {
    const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "test-tableware"));
    return row.id;
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    ({ default: sitemap } = await import("@/app/sitemap"));
    catalogService = await import("@/features/catalog/service");
    discountsStaff = await import("@/features/discounts/staff-service");
    variantsStaff = await import("@/features/catalog/variants-staff-service");
    settingsActions = await import("@/app/panel/(protected)/settings/actions");
    settingsStaff = await import("@/features/settings/staff-service");
    settingsReaders = await import("@/features/settings/service");
  });

  afterAll(async () => {
    await pool.end();
  });

  let ids: FixtureIds;
  let actorId: number;

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ids = await seedFixtures(db);
    ({ userId: actorId } = await createStaffSession(db, hashToken, DEVELOPER_DEFAULT_PERMISSIONS));
  });

  describe("sitemap", () => {
    it("includes an active product, its category, a content page, and /wholesale (the flag is on)", async () => {
      const urls = (await sitemap()).map((entry) => entry.url);
      expect(urls.some((url) => url.endsWith("/product/test-plate"))).toBe(true);
      expect(urls.some((url) => url.endsWith("/category/test-tableware"))).toBe(true);
      expect(urls.some((url) => url.endsWith("/about"))).toBe(true);
      expect(urls.some((url) => url.endsWith("/wholesale"))).toBe(true);
    });

    it("drops a product once it's set to draft", async () => {
      await db.update(products).set({ status: "draft" }).where(eq(products.id, await plateProductId()));
      const urls = (await sitemap()).map((entry) => entry.url);
      expect(urls.some((url) => url.endsWith("/product/test-plate"))).toBe(false);
    });

    it("drops every product in a category once the category is hidden", async () => {
      await db.update(categories).set({ isActive: false }).where(eq(categories.id, await tablewareCategoryId()));
      const urls = (await sitemap()).map((entry) => entry.url);
      expect(urls.some((url) => url.endsWith("/product/test-plate"))).toBe(false);
      expect(urls.some((url) => url.endsWith("/category/test-tableware"))).toBe(false);
    });
  });

  describe("product JSON-LD data", () => {
    it("getProductDetail(...).seo reflects a real active discount's price and a real stock change", async () => {
      const before = await catalogService.getProductDetail("test-plate");
      expect(before?.seo).toEqual({ sku: "TEST-PLATE", price: "1000.00", availability: "InStock" });

      const discount = await discountsStaff.createDiscount(
        {
          name: "Test 10% off",
          type: "percent",
          value: "10",
          targetType: "product",
          categoryId: "",
          productIds: String(await plateProductId()),
          startsAt: "",
          endsAt: "",
          isActive: "true",
        },
        { id: actorId },
      );
      expect(discount.ok).toBe(true);

      const discounted = await catalogService.getProductDetail("test-plate");
      expect(discounted?.seo.price).toBe("900.00");

      const stockChange = await variantsStaff.setVariantStock(ids.plate, 0, { id: actorId });
      expect(stockChange.ok).toBe(true);

      const soldOut = await catalogService.getProductDetail("test-plate");
      expect(soldOut?.seo.availability).toBe("OutOfStock");
    });
  });

  describe("Contact page data", () => {
    it("getContactInfo() reflects a phone/address change saved through the real bank-settings action", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      const { version } = await settingsStaff.getBankSettingsForEdit();

      const result = await settingsActions.saveBankSettingsAction(
        null,
        form({
          version,
          accountCount: "1",
          account0BankName: "Test Bank",
          account0Title: "RS Home",
          account0Number: "0123-4567890-1",
          account0Iban: "",
          account0Note: "",
          phone: "0321 5550000",
          whatsapp: "+92 321 555 0000",
          address: "New Test Address, Karachi",
        }),
      );
      expect(result).toEqual({ ok: true });

      const contact = await settingsReaders.getContactInfo();
      expect(contact.phone).toBe("0321 5550000");
      expect(contact.address).toBe("New Test Address, Karachi");
    });
  });
});
