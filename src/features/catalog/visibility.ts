/**
 * Whether a category shows up on the storefront (S10): one level of nesting only, and
 * hiding a parent hides its children too, without changing the children's own `is_active` flag.
 * Pure (no DB), so the rule is unit-tested directly; `features/catalog/service.ts` applies it to
 * the full category table (fetched once, a handful of rows) rather than filtering per component.
 */
export type CategoryNode = { id: number; parentId: number | null; isActive: boolean };

export function isCategoryVisible(category: CategoryNode, byId: ReadonlyMap<number, CategoryNode>): boolean {
  if (!category.isActive) return false;
  if (category.parentId === null) return true;
  const parent = byId.get(category.parentId);
  return parent !== undefined && parent.isActive;
}

/** The ids of every category that should appear on the storefront, out of the full table. */
export function visibleCategoryIds(categories: readonly CategoryNode[]): Set<number> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const visible = new Set<number>();
  for (const category of categories) {
    if (isCategoryVisible(category, byId)) visible.add(category.id);
  }
  return visible;
}
