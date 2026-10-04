/**
 * The panel's categories CRUD (S10 phase 1): DB access only, no business rules (ARCHITECTURE.md
 * §2) — `staff-service.ts` owns the parent/child rules, slug-clash messaging and audit rows.
 */
import { and, asc, count, eq, inArray, like, ne, or, type SQL } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { categories, products } from "@/server/db/schema/catalog";
import { likeContains } from "@/lib/sql-like";

export type CategoryRow = typeof categories.$inferSelect;
export type CategoryUpdate = Partial<typeof categories.$inferInsert>;

const contains = likeContains;

function searchCondition(text: string): SQL | undefined {
  return or(like(categories.name, contains(text)), like(categories.slug, contains(text)));
}

/** Every category, for the parent dropdown and the list's "parent name" lookups: a handful of rows. */
export function listAllCategoriesForStaff(): Promise<CategoryRow[]> {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id));
}

/** One page of categories, sub-categories sorted under their own `sort_order`, parents first. */
export async function listCategoriesPage(
  search: string | undefined,
  page: { limit: number; offset: number },
): Promise<{ rows: CategoryRow[]; total: number }> {
  const where = search ? searchCondition(search) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(where)
      .orderBy(asc(categories.sortOrder), asc(categories.id))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ count: count() }).from(categories).where(where),
  ]);
  return { rows, total: total.count };
}

export async function getCategoryById(id: number, client: DbClient = db): Promise<CategoryRow | undefined> {
  const [row] = await client.select().from(categories).where(eq(categories.id, id));
  return row;
}

/** `SELECT … FOR UPDATE` on the category row: every staff write runs its checks under this lock. */
export async function lockCategoryById(tx: DbClient, id: number): Promise<CategoryRow | undefined> {
  const [row] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
  return row;
}

export async function countChildren(parentId: number, client: DbClient = db): Promise<number> {
  const [row] = await client.select({ count: count() }).from(categories).where(eq(categories.parentId, parentId));
  return row.count;
}

export async function countProductsByCategoryId(id: number): Promise<number> {
  const [row] = await db.select({ count: count() }).from(products).where(eq(products.categoryId, id));
  return row.count;
}

export async function countProductsByCategoryIds(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ categoryId: products.categoryId, count: count() }).from(products).where(inArray(products.categoryId, ids)).groupBy(products.categoryId);
  return new Map(rows.map((row) => [row.categoryId, row.count]));
}

/** True when another category (not `excludeId`) already uses this slug. */
export async function slugInUse(slug: string, excludeId?: number): Promise<boolean> {
  const where = excludeId ? and(eq(categories.slug, slug), ne(categories.id, excludeId)) : eq(categories.slug, slug);
  const [row] = await db.select({ id: categories.id }).from(categories).where(where).limit(1);
  return !!row;
}

export async function insertCategory(tx: DbClient, values: typeof categories.$inferInsert): Promise<number> {
  const [result] = await tx.insert(categories).values(values);
  return result.insertId;
}

export async function updateCategory(tx: DbClient, id: number, values: CategoryUpdate): Promise<void> {
  await tx.update(categories).set(values).where(eq(categories.id, id));
}

export async function deleteCategory(tx: DbClient, id: number): Promise<void> {
  await tx.delete(categories).where(eq(categories.id, id));
}
