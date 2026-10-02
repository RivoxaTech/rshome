/**
 * Pure display helpers for the coupons panel (S13). The status pill is what `features/pricing`'s
 * own `resolveCoupon` would tell a customer right now — the coupon is run through the real rule
 * with a cart that exactly meets its minimum order and holds no discounted line, so the window,
 * the active flag and the total usage limit are judged by the one tested implementation rather
 * than a copy of it. No DB or I/O, unit-tested directly.
 */
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { resolveCoupon, type PricingCoupon } from "@/features/pricing/pricing";
import type { CouponTab, CouponType } from "./schemas";

export type CouponStatus = Exclude<CouponTab, "all">;

export function couponStatus(coupon: PricingCoupon, now: Date): CouponStatus {
  const result = resolveCoupon({
    couponCode: coupon.code,
    coupon,
    subtotal: coupon.minOrder ?? 0,
    hasDiscountedLine: false,
    couponsEnabled: true,
    now,
  });
  if (result.status !== "rejected") return "active";
  switch (result.reason) {
    case "COUPON_INACTIVE":
      return "inactive";
    case "COUPON_NOT_STARTED":
      return "scheduled";
    case "COUPON_EXPIRED":
      return "expired";
    case "COUPON_USAGE_LIMIT":
      return "used_up";
    default:
      // Unreachable with this probe (the code matches, no phone, no discounted line, min order met).
      return "active";
  }
}

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
  inactive: "Inactive",
};

export const COUPON_TAB_LABELS: Record<CouponTab, string> = { all: "All", ...COUPON_STATUS_LABELS };

/** One colour per status, readable in light and dark: dot, pill background and pill text. */
export const COUPON_STATUS_COLORS: Record<CouponStatus, { dot: string; bg: string; text: string }> = {
  active: { dot: "bg-emerald-500", bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400" },
  scheduled: { dot: "bg-blue-500", bg: "bg-blue-500/15", text: "text-blue-700 dark:text-blue-400" },
  expired: { dot: "bg-amber-500", bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
  used_up: { dot: "bg-red-500", bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400" },
  inactive: { dot: "bg-muted-foreground/60", bg: "bg-muted", text: "text-muted-foreground" },
};

/** "10%" (with "up to PKR 500" when capped) for a percentage, "PKR 200 off" for a fixed amount. */
export function couponValueText(type: CouponType, value: string, maxDiscount: string | null): string {
  if (type === "percent") {
    const whole = decimalToPaisa(value) / 100;
    const percent = `${Number.isInteger(whole) ? whole : whole.toFixed(2).replace(/0+$/, "")}%`;
    return maxDiscount ? `${percent} (up to ${formatMoney(decimalToPaisa(maxDiscount))})` : percent;
  }
  return `${formatMoney(decimalToPaisa(value))} off`;
}

/** "12 / 50" with a limit, "12" without — always the live `coupon_usages` count, never a copied number. */
export function usageText(usageCount: number, usageLimit: number | null): string {
  return usageLimit === null ? String(usageCount) : `${usageCount} / ${usageLimit}`;
}
