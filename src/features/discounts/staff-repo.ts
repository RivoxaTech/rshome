/**
 * The panel's discounts CRUD (S12): DB access only, no business rules (ARCHITECTURE.md §2) —
 * `staff-service.ts` owns the target checks, status computation, the overlap hint and audit rows.
 * `repo.ts` stays the storefront's read path (switched-on discounts for pricing).
 */
import { asc, desc, eq, inArray, like } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { categories, products } from "@/server/db/schema/catalog";
import { discounts, discountTargets } from "@/server/db/schema/promotions";
import { likeContains } from "@/lib/sql-like";

export type DiscountRow = typeof discounts.$inferSelect;
export type DiscountUpdate = Partial<typeof discounts.$inferInsert>;
export type DiscountWithTargets = { discount: DiscountRow; targetIds: number[] };

const contains = likeContains;

async function targetsFor(rows: DiscountRow[], client: DbClient = db): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>(rows.map((row) => [row.id, []]));
  if (rows.length === 0) return map;
  const targetRows = await client
    .select()
    .from(discountTargets)
    .where(
      inArray(
        discountTargets.discountId,
        rows.map((row) => row.id),
      ),
    );
  for (const target of targetRows) map.get(target.discountId)?.push(target.targetId);
  return map;
}

/**
 * Every discount (optionally name-searched), newest first, with its target ids. The table holds a
 * handful of rows, so the status tabs and pagination are computed in memory by the service —
 * the "active now" rule stays in `features/pricing` rather than being re-expressed in SQL.
 */
export async function listAllDiscountsWithTargets(search?: string): Promise<DiscountWithTargets[]> {
  const rows = await db
    .select()
    .from(discounts)
    .where(search ? like(discounts.name, contains(search)) : undefined)
    .orderBy(desc(discounts.createdAt), desc(discounts.id));
  const targets = await targetsFor(rows);
  return rows.map((discount) => ({ discount, targetIds: targets.get(discount.id) ?? [] }));
}

export async function getDiscountWithTargets(id: number): Promise<DiscountWithTargets | undefined> {
  const [row] = await db.select().from(discounts).where(eq(discounts.id, id));
  if (!row) return undefined;
  const targets = await targetsFor([row]);
  return { discount: row, targetIds: targets.get(row.id) ?? [] };
}

/** `SELECT … FOR UPDATE` on the discount row: every staff write runs its checks under this lock. */
export async function lockDiscountById(tx: DbClient, id: number): Promise<DiscountWithTargets | undefined> {
  const [row] = await tx.select().from(discounts).where(eq(discounts.id, id)).for("update");
  if (!row) return undefined;
  const targets = await targetsFor([row], tx);
  return { discount: row, targetIds: targets.get(row.id) ?? [] };
}

export async function insertDiscount(tx: DbClient, values: typeof discounts.$inferInsert): Promise<number> {
  const [result] = await tx.insert(discounts).values(values);
  return result.insertId;
}

export async function updateDiscount(tx: DbClient, id: number, values: DiscountUpdate): Promise<void> {
  await tx.update(discounts).set(values).where(eq(discounts.id, id));
}

/** Replaces the target set wholesale (a handful of rows; simpler than a diff). */
export async function replaceDiscountTargets(tx: DbClient, discountId: number, targetIds: number[]): Promise<void> {
  await tx.delete(discountTargets).where(eq(discountTargets.discountId, discountId));
  if (targetIds.length > 0) await tx.insert(discountTargets).values(targetIds.map((targetId) => ({ discountId, targetId })));
}

export async function deleteDiscount(tx: DbClient, id: number): Promise<void> {
  await tx.delete(discountTargets).where(eq(discountTargets.discountId, id));
  await tx.delete(discounts).where(eq(discounts.id, id));
}

// ── Targets: the categories and products a discount can point at ────────────────────────────────

export type CategoryOption = { id: number; name: string; parentId: number | null; isActive: boolean };

export function listCategoryOptions(): Promise<CategoryOption[]> {
  return db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId, isActive: categories.isActive })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.id));
}

export type ProductOption = { id: number; name: string; status: typeof products.$inferSelect.status };

/** Every product (any status) for the picker — a few hundred rows at most, filtered client-side. */
export function listProductOptions(): Promise<ProductOption[]> {
  return db.select({ id: products.id, name: products.name, status: products.status }).from(products).orderBy(asc(products.name), asc(products.id));
}

export async function getCategoryNamesByIds(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: categories.id, name: categories.name }).from(categories).where(inArray(categories.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function getProductNamesByIds(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** What `features/pricing`'s `discountMatchesProduct` needs for every product, for the overlap hint. */
export type OverlapProductRow = { id: number; price: string; categoryId: number; parentCategoryId: number | null };

export function listProductsForOverlap(): Promise<OverlapProductRow[]> {
  return db
    .select({ id: products.id, price: products.price, categoryId: products.categoryId, parentCategoryId: categories.parentId })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId));
}
