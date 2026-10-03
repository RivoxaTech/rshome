/**
 * Product CSV import (check + commit) and export against the test database (S18). The Route
 * Handlers are called directly with a real `Request`, the same way `payments/proofs.integration.test.ts`
 * does; `next/headers` is replaced by the request state below, since there is no Next server
 * around them. Skips without TEST_DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { productVariants, products } from "@/server/db/schema/catalog";
import { assertTestDatabase, createStaffSession, resetTables, seedFixtures } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

type Db = typeof import("@/server/db/client");
type CheckRoute = typeof import("@/app/api/panel/products/import/check/route");
type CommitRoute = typeof import("@/app/api/panel/products/import/commit/route");
type ExportRoute = typeof import("@/app/api/panel/products/export/route");

const HEADER_ROW = [
  "Product name",
  "Slug",
  "Category slug",
  "Status",
  "Short description",
  "Description",
  "Featured",
  "Base price",
  "Variant SKU",
  "Variant label",
  "Attributes",
  "Stock",
  "Price override",
  "Variant active",
].join(",");

function csvRow(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    name: "New Ceramic Plate",
    slug: "new-ceramic-plate",
    category: "test-tableware",
    status: "active",
    shortDesc: "",
    desc: "",
    featured: "false",
    price: "1500.00",
    sku: "NEW-PLATE-01",
    label: "Default",
    attributes: "",
    stock: "25",
    priceOverride: "",
    active: "true",
  };
  const row = { ...defaults, ...overrides } as Record<string, string>;
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return [row.name, row.slug, row.category, row.status, row.shortDesc, row.desc, row.featured, row.price, row.sku, row.label, row.attributes, row.stock, row.priceOverride, row.active]
    .map(cell)
    .join(",");
}

function csvFile(rows: string[]): Blob {
  return new Blob([`${HEADER_ROW}\r\n${rows.join("\r\n")}\r\n`], { type: "text/csv" });
}

describe.skipIf(!TEST_DATABASE_URL)("product CSV import/export (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let checkRoute: CheckRoute;
  let commitRoute: CommitRoute;
  let exportRoute: ExportRoute;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  async function multipartRequest(url: string, fields: Record<string, Blob | string>): Promise<Request> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value instanceof Blob) form.append(key, value, "import.csv");
      else form.append(key, value);
    }
    const encoded = new Response(form);
    const body = await encoded.blob();
    const headers = new Headers({ "content-type": encoded.headers.get("content-type")!, origin: ORIGIN });
    return new Request(url, { method: "POST", body, headers });
  }

  async function check(csv: Blob) {
    const response = await checkRoute.POST(await multipartRequest(`${ORIGIN}/api/panel/products/import/check`, { file: csv }));
    return { status: response.status, body: await response.json() };
  }

  async function commit(csv: Blob, token: string) {
    const response = await commitRoute.POST(
      await multipartRequest(`${ORIGIN}/api/panel/products/import/commit`, { file: csv, token, fileName: "import.csv" }),
    );
    return { status: response.status, body: await response.json() };
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    checkRoute = await import("@/app/api/panel/products/import/check/route");
    commitRoute = await import("@/app/api/panel/products/import/commit/route");
    exportRoute = await import("@/app/api/panel/products/export/route");
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    await seedFixtures(db);
    await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
  });

  it("checks a clean file, reports zero errors, and writes nothing", async () => {
    const before = await db.select().from(products);
    const result = await check(csvFile([csvRow()]));
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.report.rowErrors).toEqual([]);
    expect(result.body.report.toCreateProducts).toBe(1);
    expect(result.body.token).toEqual(expect.any(String));
    const after = await db.select().from(products);
    expect(after.length).toBe(before.length);
  });

  it("reports every kind of error with row numbers and writes nothing", async () => {
    const rows = [
      csvRow({ sku: "BAD-ROW-PRICE", price: "not-a-price" }),
      csvRow({ sku: "BAD-ROW-CATEGORY", slug: "bad-category-product", category: "no-such-category" }),
      csvRow({ sku: "BAD-ROW-STATUS", slug: "bad-status-product", status: "deleted" }),
    ];
    const before = await db.select().from(products);
    const result = await check(csvFile(rows));
    expect(result.body.ok).toBe(true);
    const errors = result.body.report.rowErrors as { row: number; column: string }[];
    expect(errors.some((e) => e.row === 2 && e.column === "Base price")).toBe(true);
    expect(errors.some((e) => e.row === 3 && e.column === "Category slug")).toBe(true);
    expect(errors.some((e) => e.row === 4 && e.column === "Status")).toBe(true);
    const after = await db.select().from(products);
    expect(after.length).toBe(before.length);
  });

  it("refuses to commit a file with any row errors, importing nothing", async () => {
    const checked = await check(csvFile([csvRow(), csvRow({ sku: "BAD-SKU-ROW", slug: "second-bad-product", price: "oops" })]));
    expect(checked.body.report.rowErrors.length).toBeGreaterThan(0);
    const before = await db.select().from(products);
    const result = await commit(csvFile([csvRow(), csvRow({ sku: "BAD-SKU-ROW", slug: "second-bad-product", price: "oops" })]), checked.body.token);
    expect(result.body.ok).toBe(false);
    const after = await db.select().from(products);
    expect(after.length).toBe(before.length);
  });

  it("imports a clean file: creates the product and variant, and writes audit rows", async () => {
    const checked = await check(csvFile([csvRow()]));
    const committed = await commit(csvFile([csvRow()]), checked.body.token);
    expect(committed.status).toBe(200);
    expect(committed.body).toMatchObject({ ok: true, created: 1, updated: 0 });

    const [product] = await db.select().from(products).where(eq(products.slug, "new-ceramic-plate"));
    expect(product).toBeTruthy();
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, "NEW-PLATE-01"));
    expect(variant.stock).toBe(25);

    const createRows = await db.select().from(auditLogs).where(eq(auditLogs.action, "product.import"));
    expect(createRows.length).toBe(1);
    const summaryRows = await db.select().from(auditLogs).where(eq(auditLogs.action, "product.bulk_import"));
    expect(summaryRows.length).toBe(1);
  });

  it("updates an existing product matched by slug, overwriting stock", async () => {
    await check(csvFile([csvRow()])).then((r) => commit(csvFile([csvRow()]), r.body.token));

    const updateRow = csvRow({ stock: "99", price: "1600.00" });
    const checked = await check(csvFile([updateRow]));
    expect(checked.body.report.toUpdateProducts).toBe(1);
    const committed = await commit(csvFile([updateRow]), checked.body.token);
    expect(committed.body).toMatchObject({ ok: true, created: 0, updated: 1 });

    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, "NEW-PLATE-01"));
    expect(variant.stock).toBe(99);
    const [product] = await db.select().from(products).where(eq(products.slug, "new-ceramic-plate"));
    expect(product.price).toBe("1600.00");
  });

  it("refuses a SKU that already belongs to a different product", async () => {
    const row = csvRow({ sku: "TEST-PLATE" }); // already used by the fixture's own plate variant
    const result = await check(csvFile([row]));
    const errors = result.body.report.rowErrors as { column: string; message: string }[];
    expect(errors.some((e) => e.column === "Variant SKU" && e.message.includes("different product"))).toBe(true);
  });

  it("refuses an oversize file", async () => {
    const huge = csvFile([csvRow({ desc: "x".repeat(3 * 1024 * 1024) })]);
    const result = await check(huge);
    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
  });

  it("refuses a tampered or expired check token", async () => {
    const checked = await check(csvFile([csvRow()]));
    const tampered = await commit(csvFile([csvRow()]), `${checked.body.token}x`);
    expect(tampered.body.ok).toBe(false);

    const differentFile = await commit(csvFile([csvRow({ stock: "5" })]), checked.body.token);
    expect(differentFile.body.ok).toBe(false);
  });

  it("a Developer session can export products, formula-injection neutralised", async () => {
    await check(csvFile([csvRow({ name: "=HYPERLINK(\"http://evil\")" })])).then((r) => commit(csvFile([csvRow({ name: "=HYPERLINK(\"http://evil\")" })]), r.body.token));
    const response = await exportRoute.GET(new Request(`${ORIGIN}/api/panel/products/export`));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("'=HYPERLINK");
  });

  it("refuses an Admin session on check, commit and export (product keys are Developer-only)", async () => {
    await signInAs(ADMIN_DEFAULT_PERMISSIONS);
    expect((await check(csvFile([csvRow()]))).status).toBe(403);
    expect((await exportRoute.GET(new Request(`${ORIGIN}/api/panel/products/export`))).status).toBe(403);
  });
});
