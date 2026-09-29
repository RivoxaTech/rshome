import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { discounts, discountTargets } from "@/server/db/schema/promotions";

export type DiscountRow = typeof discounts.$inferSelect;

/**
 * Switched-on discounts with their target ids. The date window is left to
 * `features/pricing/pricing.ts` (isDiscountActive), so the rule lives in one tested place; the
 * table holds a handful of rows, so loading the whole switched-on set is cheap.
 */
export async function getEnabledDiscountsWithTargets(): Promise<{ discount: DiscountRow; targetIds: number[] }[]> {
  const discountRows = await db.select().from(discounts).where(eq(discounts.isActive, true));
  if (discountRows.length === 0) return [];

  const targetRows = await db
    .select()
    .from(discountTargets)
    .where(
      inArray(
        discountTargets.discountId,
        discountRows.map((row) => row.id),
      ),
    );

  return discountRows.map((discount) => ({
    discount,
    targetIds: targetRows.filter((target) => target.discountId === discount.id).map((target) => target.targetId),
  }));
}
