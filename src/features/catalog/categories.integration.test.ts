/**
 * The panel's categories CRUD against the test database (S10 phase 1): slug clashes, the
 * one-level parent/child rules, delete refusals (children, then products), hide/show reflected in
 * the storefront's category query, audit rows, and the Developer-vs-Admin RBAC wall. Mirrors the
 * `next/headers` mock every other panel integration suite uses, since there is no real Next
 * request scope here. Skips without TEST_DATABASE_URL.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { categories, products } from "@/server/db/schema/catalog";
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
type PanelActions = typeof import("@/app/panel/(protected)/categories/actions");

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

describe.skipIf(!TEST_DATABASE_URL)("categories CRUD (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let staffService: typeof import("./staff-service");
  let service: typeof import("./service");
  let panelActions: PanelActions;
  let CategoriesPageBody: typeof import("@/components/panel/categories/CategoriesPageBody").CategoriesPageBody;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token } = await createStaffSession(db, hashToken, permissionKeys);
    current.cookies.set("panel_session", token);
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  const validInput = (overrides: Record<string, string | number> = {}) => ({
    name: "Trays",
    slug: "trays",
    description: "",
    imagePath: "",
    sortOrder: "0",
    isActive: "true",
    parentId: "",
    ...overrides,
  });

  const auditRows = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "category"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    staffService = await import("./staff-service");
    service = await import("./service");
    panelActions = await import("@/app/panel/(protected)/categories/actions");
    ({ CategoriesPageBody } = await import("@/components/panel/categories/CategoriesPageBody"));
  });

  afterAll(async () => {
    await pool.end();
  });

  let actorId: number;

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ({ userId: actorId } = await createStaffSession(db, hashToken, DEVELOPER_DEFAULT_PERMISSIONS));
  });

  describe("create", () => {
    it("creates a category and writes an audit row", async () => {
      const result = await staffService.createCategory(validInput(), { id: actorId });
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("unreachable");

      const [row] = await db.select().from(categories).where(eq(categories.id, result.id!));
      expect(row).toMatchObject({ name: "Trays", slug: "trays", isActive: true });

      const audit = await auditRows(result.id!, "category.create");
      expect(audit).toHaveLength(1);
    });

    it("refuses a slug already in use", async () => {
      await staffService.createCategory(validInput({ slug: "trays" }), { id: actorId });
      const result = await staffService.createCategory(validInput({ name: "Trays 2", slug: "trays" }), { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.fieldErrors?.slug).toBeDefined();
    });

    it("refuses a parent that already has a parent itself (one level of nesting)", async () => {
      const top = await staffService.createCategory(validInput({ slug: "tableware" }), { id: actorId });
      if (!top.ok) throw new Error("unreachable");
      const child = await staffService.createCategory(validInput({ name: "Plates", slug: "plates", parentId: String(top.id) }), { id: actorId });
      if (!child.ok) throw new Error("unreachable");

      const grandchild = await staffService.createCategory(validInput({ name: "Side Plates", slug: "side-plates", parentId: String(child.id) }), { id: actorId });
      expect(grandchild.ok).toBe(false);
      if (grandchild.ok) throw new Error("unreachable");
      expect(grandchild.error).toMatch(/already has a parent/);
    });
  });

  describe("update", () => {
    it("updates fields and writes an audit row", async () => {
      const created = await staffService.createCategory(validInput(), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      const result = await staffService.updateCategoryById(created.id!, validInput({ name: "Serving Trays", slug: "trays", sortOrder: "5" }), { id: actorId });
      expect(result).toMatchObject({ ok: true });

      const [row] = await db.select().from(categories).where(eq(categories.id, created.id!));
      expect(row).toMatchObject({ name: "Serving Trays", sortOrder: 5 });
      expect(await auditRows(created.id!, "category.update")).toHaveLength(1);
    });

    it("keeping its own slug on update is not a clash", async () => {
      const created = await staffService.createCategory(validInput({ slug: "trays" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const result = await staffService.updateCategoryById(created.id!, validInput({ slug: "trays", sortOrder: "1" }), { id: actorId });
      expect(result.ok).toBe(true);
    });

    it("refuses a category to become its own parent", async () => {
      const created = await staffService.createCategory(validInput(), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const result = await staffService.updateCategoryById(created.id!, validInput({ parentId: String(created.id) }), { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toMatch(/own parent/);
    });

    it("refuses to give a parent to a category that already has children", async () => {
      const parentA = await staffService.createCategory(validInput({ slug: "tableware" }), { id: actorId });
      if (!parentA.ok) throw new Error("unreachable");
      const parentB = await staffService.createCategory(validInput({ name: "Decor", slug: "decor" }), { id: actorId });
      if (!parentB.ok) throw new Error("unreachable");
      const child = await staffService.createCategory(validInput({ name: "Plates", slug: "plates", parentId: String(parentA.id) }), { id: actorId });
      if (!child.ok) throw new Error("unreachable");

      const result = await staffService.updateCategoryById(parentA.id!, validInput({ slug: "tableware", parentId: String(parentB.id) }), { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toMatch(/sub-categories/);
    });
  });

  describe("hide/show and the storefront query", () => {
    it("a hidden parent also hides its (still-active) children from the storefront", async () => {
      const parent = await staffService.createCategory(validInput({ slug: "tableware" }), { id: actorId });
      if (!parent.ok) throw new Error("unreachable");
      const child = await staffService.createCategory(validInput({ name: "Plates", slug: "plates", parentId: String(parent.id) }), { id: actorId });
      if (!child.ok) throw new Error("unreachable");

      let visible = await service.getStoreCategories();
      expect(visible.map((c) => c.slug).sort()).toEqual(["plates", "tableware"]);

      const hidden = await staffService.setCategoryActive(parent.id!, false, { id: actorId });
      expect(hidden.ok).toBe(true);

      visible = await service.getStoreCategories();
      expect(visible).toHaveLength(0);

      // The child's own flag is untouched by hiding its parent.
      const [childRow] = await db.select().from(categories).where(eq(categories.id, child.id!));
      expect(childRow.isActive).toBe(true);

      const audit = await auditRows(parent.id!, "category.status_change");
      expect(audit).toHaveLength(1);
    });

    it("refuses setting a status the category is already in", async () => {
      const created = await staffService.createCategory(validInput(), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      const result = await staffService.setCategoryActive(created.id!, true, { id: actorId });
      expect(result.ok).toBe(false);
    });
  });

  describe("delete", () => {
    it("refuses deleting a category with sub-categories", async () => {
      const parent = await staffService.createCategory(validInput({ slug: "tableware" }), { id: actorId });
      if (!parent.ok) throw new Error("unreachable");
      const child = await staffService.createCategory(validInput({ name: "Plates", slug: "plates", parentId: String(parent.id) }), { id: actorId });
      if (!child.ok) throw new Error("unreachable");

      const result = await staffService.deleteCategoryById(parent.id!, { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toMatch(/sub-categor/);

      expect((await db.select().from(categories).where(eq(categories.id, parent.id!)))).toHaveLength(1);
    });

    it("refuses deleting a category with products, suggesting Hide instead", async () => {
      const created = await staffService.createCategory(validInput(), { id: actorId });
      if (!created.ok) throw new Error("unreachable");
      await db.insert(products).values({ categoryId: created.id!, name: "Tray", slug: "tray", price: "1000.00" });

      const result = await staffService.deleteCategoryById(created.id!, { id: actorId });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toMatch(/Hide it instead/);
    });

    it("deletes an empty category and writes an audit row", async () => {
      const created = await staffService.createCategory(validInput(), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      const result = await staffService.deleteCategoryById(created.id!, { id: actorId });
      expect(result.ok).toBe(true);

      expect(await db.select().from(categories).where(eq(categories.id, created.id!))).toHaveLength(0);
      expect(await auditRows(created.id!, "category.delete")).toHaveLength(1);
    });
  });

  describe("RBAC", () => {
    it("a Developer session can open the list page and create/update/delete", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      await expect(CategoriesPageBody({ searchParams: {} })).resolves.toBeDefined();

      await expectRedirectTo(() => panelActions.createCategoryAction(null, form(validInput({ slug: "developer-created" }))), "/panel/categories");
    });

    // Through the Server Action itself (not `staffService` directly), the same path the panel's
    // Delete/Hide dialogs call — a nested-`<form>` bug once broke only this path (CategoryForm.tsx
    // rendered the dialog's own `<form>` inside its save form), which a service-level test alone
    // can't catch since the action layer ran correctly either way; only the action-level call here
    // and a real browser click actually exercise the thing that broke.
    it("deleteCategoryAction actually deletes an empty category and redirects to the list", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const created = await staffService.createCategory(validInput({ slug: "action-delete-me" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      await expectRedirectTo(() => panelActions.deleteCategoryAction(null, form({ id: created.id! })), "/panel/categories");
      expect(await db.select().from(categories).where(eq(categories.id, created.id!))).toHaveLength(0);
    });

    it("hideCategoryAction actually hides a category and redirects to the list", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const created = await staffService.createCategory(validInput({ slug: "action-hide-me" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      await expectRedirectTo(() => panelActions.hideCategoryAction(null, form({ id: created.id! })), "/panel/categories");
      const [row] = await db.select().from(categories).where(eq(categories.id, created.id!));
      expect(row.isActive).toBe(false);
    });

    it("updateCategoryAction actually saves the change and redirects to the list", async () => {
      await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
      const created = await staffService.createCategory(validInput({ slug: "action-update-me" }), { id: actorId });
      if (!created.ok) throw new Error("unreachable");

      await expectRedirectTo(
        () => panelActions.updateCategoryAction(null, form({ ...validInput({ slug: "action-update-me", sortOrder: "9" }), id: created.id! })),
        "/panel/categories",
      );
      const [row] = await db.select().from(categories).where(eq(categories.id, created.id!));
      expect(row.sortOrder).toBe(9);
    });

    it("an Admin session is refused on the list page and every Server Action", async () => {
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => CategoriesPageBody({ searchParams: {} }), "/panel/403");
      await expectRedirectTo(() => panelActions.createCategoryAction(null, form(validInput())), "/panel/403");
      await expectRedirectTo(() => panelActions.updateCategoryAction(null, form({ ...validInput(), id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.deleteCategoryAction(null, form({ id: "1" })), "/panel/403");
      await expectRedirectTo(() => panelActions.hideCategoryAction(null, form({ id: "1" })), "/panel/403");
    });

    it("a session with no permissions is refused", async () => {
      await signInAs([]);
      await expectRedirectTo(() => CategoriesPageBody({ searchParams: {} }), "/panel/403");
    });
  });
});
