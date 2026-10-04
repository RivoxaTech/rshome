/**
 * Pure display helpers for the discounts panel (S12): the status pill is derived from the pricing
 * module's own `isDiscountActive` — the one rule for "is this discount on right now" — never a
 * second date/flag check. No DB or I/O, unit-tested directly.
 */
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { isDiscountActive, type PricingDiscount } from "@/features/pricing/pricing";
import type { DiscountTab, DiscountTargetType, DiscountType } from "./schemas";
import { PILL_COLORS } from "@/lib/pill-colors";

export type DiscountStatus = Exclude<DiscountTab, "all">;

/**
 * Active now (the pricing rule says so), else: switched off -> inactive; not yet started ->
 * scheduled; otherwise its window has ended -> expired.
 */
export function discountStatus(discount: PricingDiscount, now: Date): DiscountStatus {
  if (isDiscountActive(discount, now)) return "active";
  if (!discount.isActive) return "inactive";
  if (discount.startsAt && discount.startsAt.getTime() > now.getTime()) return "scheduled";
  return "expired";
}

export const DISCOUNT_STATUS_LABELS: Record<DiscountStatus, string> = {
  active: "Active now",
  scheduled: "Scheduled",
  expired: "Expired",
  inactive: "Inactive",
};

export const DISCOUNT_TAB_LABELS: Record<DiscountTab, string> = { all: "All", ...DISCOUNT_STATUS_LABELS };

/** One colour per status, readable in light and dark: dot, pill background and pill text. */
export const DISCOUNT_STATUS_COLORS: Record<DiscountStatus, { dot: string; bg: string; text: string }> = {
  active: PILL_COLORS.emerald,
  scheduled: PILL_COLORS.blue,
  expired: PILL_COLORS.amber,
  inactive: PILL_COLORS.muted,
};

/** "10%" for a percentage, "PKR 500 off" for a fixed amount (both from the DECIMAL string). */
export function discountValueText(type: DiscountType, value: string): string {
  if (type === "percent") {
    const hundredths = decimalToPaisa(value);
    const whole = hundredths / 100;
    return `${Number.isInteger(whole) ? whole : whole.toFixed(2).replace(/0+$/, "")}%`;
  }
  return `${formatMoney(decimalToPaisa(value))} off`;
}

/** "Whole store", "Category: Trays", "3 products" — the list's target column. */
export function targetSummary(targetType: DiscountTargetType, targetCount: number, categoryName: string | null): string {
  switch (targetType) {
    case "all":
      return "Whole store";
    case "category":
      return `Category: ${categoryName ?? "(deleted)"}`;
    case "product":
      return `${targetCount} ${targetCount === 1 ? "product" : "products"}`;
  }
}
