/**
 * The panel's live order-count tab title (BUILD_PLAN.md S21): "(n) Orders" while any action is
 * due, else null (meaning: restore the page's own title). Pure, unit-tested.
 */
export function ordersTabTitle(count: number): string | null {
  if (count <= 0) return null;
  return `(${count}) Order${count === 1 ? "" : "s"}`;
}
