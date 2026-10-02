/**
 * Manual product ordering (S10 phase 2b): pure functions over plain id arrays, shared by the
 * shop order (`products.sort_order`, global) and the featured order (`products.featured_sort_order`,
 * scoped to featured active products). No DB access here — `arrange-service.ts` and
 * `products-staff-service.ts` load/lock the real rows and call these to compute the new order.
 */

export type Placement = { type: "top" } | { type: "end" } | { type: "position"; position: number };

/** 0-based insertion index for `placement` into a list of the given length, clamped into range. */
export function resolvePlacementIndex(length: number, placement: Placement): number {
  if (placement.type === "top") return 0;
  if (placement.type === "end") return length;
  return Math.min(Math.max(Math.trunc(placement.position) - 1, 0), length);
}

/** Splices `newId` into `orderedIds` at `placement`. `orderedIds` must not already contain it. */
export function insertId(orderedIds: readonly number[], newId: number, placement: Placement): number[] {
  const index = resolvePlacementIndex(orderedIds.length, placement);
  const result = [...orderedIds];
  result.splice(index, 0, newId);
  return result;
}

/** Removes `movedId` from `orderedIds` and reinserts it at `placement`. */
export function moveId(orderedIds: readonly number[], movedId: number, placement: Placement): number[] {
  const without = orderedIds.filter((id) => id !== movedId);
  return insertId(without, movedId, placement);
}

/**
 * Writes `newScopeOrder` back into `fullOrderedIds` at exactly the array indices `scopeIds`
 * occupy today — every id *not* in `scopeIds` keeps its exact original index, so renormalizing
 * afterwards gives it the exact same value it had before. `newScopeOrder` must be a permutation
 * of `scopeIds` (same ids, new order); anything else is a caller bug, not a runtime input to guard.
 */
export function reorderScope(fullOrderedIds: readonly number[], scopeIds: ReadonlySet<number>, newScopeOrder: readonly number[]): number[] {
  const result = [...fullOrderedIds];
  let cursor = 0;
  for (let i = 0; i < result.length; i++) {
    if (scopeIds.has(result[i])) {
      result[i] = newScopeOrder[cursor];
      cursor++;
    }
  }
  return result;
}

/** `id -> 0-based index`, the new `sort_order`/`featured_sort_order` values to write back. */
export function renormalize(orderedIds: readonly number[]): Map<number, number> {
  const map = new Map<number, number>();
  orderedIds.forEach((id, index) => map.set(id, index));
  return map;
}
