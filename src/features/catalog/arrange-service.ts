/**
 * `/panel/products/arrange` (S10): the two tabs' read models plus their Server Action
 * targets — a full drag-drop save and a single-row "move to top/end/position N". Both write paths
 * mirror `products-staff-service.ts`'s lock/transaction/audit shape; see `ordering.ts` for the
 * pure reorder math and `ARCHITECTURE.md` D51 for the slot-preserving category-scoped design.
 */
import { insertAuditLog } from "@/features/audit/repo";
import { db, type DbClient } from "@/server/db/client";
import { moveId, renormalize, reorderScope, type Placement } from "./ordering";
import { getPrimaryImagesByProductId } from "./repo";
import {
  getOrderedFeaturedProductIds,
  getOrderedProductIds,
  getProductsByIds,
  lockOrderedFeaturedProductIds,
  lockOrderedProductIds,
  updateProductFeaturedSortOrders,
  updateProductSortOrders,
  type ArrangeRow,
} from "./products-staff-repo";
import type { StaffActionResult } from "./staff-service";
import { StaffActionError } from "@/features/shared/staff-result";

export type { StaffActionResult };

type Actor = { id: number };

export type ArrangeItem = { id: number; name: string; imagePath: string | null; status: ArrangeRow["status"]; isFeatured: boolean };

async function toArrangeItems(orderedIds: number[]): Promise<ArrangeItem[]> {
  const [rows, images] = await Promise.all([getProductsByIds(orderedIds), getPrimaryImagesByProductId(orderedIds)]);
  return orderedIds.flatMap((id) => {
    const row = rows.get(id);
    if (!row) return [];
    return [{ id, name: row.name, imagePath: images.get(id)?.path ?? null, status: row.status, isFeatured: row.isFeatured }];
  });
}

/** The "Shop order" tab: every product (any status) in shop order, optionally scoped to one category. */
export async function getShopArrangeList(categoryId?: number): Promise<ArrangeItem[]> {
  return toArrangeItems(await getOrderedProductIds(db, categoryId));
}

/** The "Featured order" tab: active, featured products only — the only ones the featured strip shows. */
export async function getFeaturedArrangeList(): Promise<ArrangeItem[]> {
  return toArrangeItems(await getOrderedFeaturedProductIds(db));
}

// ── Placement on create and edit (the product form's "top/end/position" fields) ─────────────

/** `"keep"` (edit only) means "don't touch this order" — the caller skips applying anything. */
export function toPlacement(placement: "top" | "end" | "position" | "keep", position?: number): Placement | null {
  if (placement === "keep") return null;
  if (placement === "position") return { type: "position", position: position! };
  return { type: placement };
}

/**
 * Moves (or, for a brand-new id not yet in the list, inserts) `productId` within the shop order
 * and writes every row whose `sort_order` changed, inside `tx`. `moveId` removing-then-reinserting
 * an id that isn't present yet is exactly an insert, so this one function covers both create and
 * edit. One audit row records the whole before/after order (ARCHITECTURE.md D51).
 */
export async function applyShopPlacement(tx: DbClient, productId: number, placement: Placement, actor: Actor, now: Date): Promise<void> {
  const existing = await lockOrderedProductIds(tx);
  const next = moveId(existing, productId, placement);
  const positions = renormalize(next);
  await updateProductSortOrders(tx, [...positions.entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
  await insertAuditLog(tx, {
    userId: actor.id,
    action: "product.sort_change",
    entity: "product_order",
    entityId: "shop",
    oldValues: { order: existing },
    newValues: { order: next },
    createdAt: now,
  });
}

/** Same as `applyShopPlacement`, for the featured order (scoped to active, featured products only). */
export async function applyFeaturedPlacement(tx: DbClient, productId: number, placement: Placement, actor: Actor, now: Date): Promise<void> {
  const existing = await lockOrderedFeaturedProductIds(tx);
  const next = moveId(existing, productId, placement);
  const positions = renormalize(next);
  await updateProductFeaturedSortOrders(tx, [...positions.entries()].map(([id, featuredSortOrder]) => ({ id, featuredSortOrder })));
  await insertAuditLog(tx, {
    userId: actor.id,
    action: "product.sort_change",
    entity: "product_order",
    entityId: "featured",
    oldValues: { order: existing },
    newValues: { order: next },
    createdAt: now,
  });
}

// ── The arrange page's own saves ────────────────────────────────────────────────────────────

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id)) && new Set(b).size === set.size;
}

function auditEntityId(categoryId: number | undefined): string {
  return categoryId !== undefined ? String(categoryId) : "shop";
}

/**
 * The whole drag-drop result for the shop order, optionally scoped to one category: `orderedIds`
 * must be exactly that scope's current ids, just reordered — checked against a fresh, locked read
 * so a stale client can't corrupt a concurrent edit. A category-scoped save only overwrites that
 * category's own slots in the global order (`reorderScope`), leaving every other product's value
 * untouched; an unfiltered save replaces the whole global order outright.
 */
export async function saveShopOrder(input: { categoryId?: number; orderedIds: number[] }, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const scoped = await lockOrderedProductIds(tx, input.categoryId);
      if (!sameIdSet(scoped, input.orderedIds)) throw new StaffActionError("This list changed elsewhere. Reload and try again.");

      const fullBefore = input.categoryId === undefined ? scoped : await lockOrderedProductIds(tx);
      const fullAfter = input.categoryId === undefined ? input.orderedIds : reorderScope(fullBefore, new Set(scoped), input.orderedIds);

      const now = new Date();
      const positions = renormalize(fullAfter);
      await updateProductSortOrders(tx, [...positions.entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.sort_change",
        entity: "product_order",
        entityId: auditEntityId(input.categoryId),
        oldValues: { order: scoped },
        newValues: { order: input.orderedIds },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Same as `saveShopOrder`, for the featured order (no category filter — it's one flat list). */
export async function saveFeaturedOrder(input: { orderedIds: number[] }, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const existing = await lockOrderedFeaturedProductIds(tx);
      if (!sameIdSet(existing, input.orderedIds)) throw new StaffActionError("This list changed elsewhere. Reload and try again.");

      const now = new Date();
      const positions = renormalize(input.orderedIds);
      await updateProductFeaturedSortOrders(tx, [...positions.entries()].map(([id, featuredSortOrder]) => ({ id, featuredSortOrder })));
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.sort_change",
        entity: "product_order",
        entityId: "featured",
        oldValues: { order: existing },
        newValues: { order: input.orderedIds },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * A per-row "Move to top/end/position N" in the shop order, within `categoryId`'s scope when one
 * is given (the "position" the owner enters is then 1..count-in-category, not the global index).
 * Refuses (never throws) a product that isn't actually in that scope — `moveId` would otherwise
 * silently treat an absent id as an insert, quietly placing a product that was never part of the
 * category (or doesn't exist at all) into its order.
 */
export async function moveShopProduct(input: { productId: number; categoryId?: number; placement: Placement }, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const now = new Date();

      if (input.categoryId === undefined) {
        const full = await lockOrderedProductIds(tx);
        if (!full.includes(input.productId)) throw new StaffActionError("That product no longer exists.");

        const next = moveId(full, input.productId, input.placement);
        const positions = renormalize(next);
        await updateProductSortOrders(tx, [...positions.entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
        await insertAuditLog(tx, {
          userId: actor.id,
          action: "product.sort_change",
          entity: "product_order",
          entityId: "shop",
          oldValues: { order: full },
          newValues: { order: next },
          createdAt: now,
        });
        return;
      }

      const scoped = await lockOrderedProductIds(tx, input.categoryId);
      if (!scoped.includes(input.productId)) throw new StaffActionError("That product isn't in this category.");

      const full = await lockOrderedProductIds(tx);
      const newScopeOrder = moveId(scoped, input.productId, input.placement);
      const nextFull = reorderScope(full, new Set(scoped), newScopeOrder);
      const positions = renormalize(nextFull);
      await updateProductSortOrders(tx, [...positions.entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.sort_change",
        entity: "product_order",
        entityId: String(input.categoryId),
        oldValues: { order: scoped },
        newValues: { order: newScopeOrder },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * Same as `moveShopProduct`, for the featured order (no category scoping). Refuses a product that
 * isn't currently an active, featured product — the only ones this order concerns.
 */
export async function moveFeaturedProduct(input: { productId: number; placement: Placement }, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const existing = await lockOrderedFeaturedProductIds(tx);
      if (!existing.includes(input.productId)) throw new StaffActionError("That product isn't an active, featured product.");

      const now = new Date();
      const next = moveId(existing, input.productId, input.placement);
      const positions = renormalize(next);
      await updateProductFeaturedSortOrders(tx, [...positions.entries()].map(([id, featuredSortOrder]) => ({ id, featuredSortOrder })));
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.sort_change",
        entity: "product_order",
        entityId: "featured",
        oldValues: { order: existing },
        newValues: { order: next },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }
}
