import "@/lib/zod-config";
import { z } from "zod";
import { checkDateOrder, checkValueRange, karachiDateTimeField } from "@/features/discounts/schemas";
import { decimalToPaisa } from "@/features/pricing/money";
import { moneyField, optionalMoneyField } from "@/features/pricing/schemas";

export const COUPON_TYPES = ["percent", "fixed"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

/** A-Z, 0-9, dash and underscore only, 3–32 characters, after trimming and uppercasing. */
const COUPON_CODE_PATTERN = /^[A-Z0-9_-]+$/;

const activeField = z.preprocess((value) => value === "true" || value === true, z.boolean());

/** `""`/missing -> `null`; otherwise a whole number of at least 1 (a limit of 0 would mean "never usable" — use the Active switch for that). */
const optionalLimitField = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().int("Enter a whole number.").min(1, "Use 1 or higher.").max(1_000_000, "Enter a smaller number.").nullable(),
);

/**
 * Shared by the form (field errors as the Developer types) and the Server Action (the only check
 * that matters). Code uniqueness and the "limit below current usage" rule need the rows, so the
 * service checks them under the row lock; this schema pins the shape (REQUIREMENTS CPN-01).
 */
export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, "Use at least 3 characters.")
      .max(32, "Keep this under 32 characters.")
      .regex(COUPON_CODE_PATTERN, "Use letters, numbers, dashes and underscores only."),
    type: z.enum(COUPON_TYPES, { error: "Choose a type." }),
    value: moneyField("Enter a value, e.g. 10 or 500."),
    minOrder: optionalMoneyField,
    maxDiscount: optionalMoneyField,
    usageLimit: optionalLimitField,
    perCustomerLimit: optionalLimitField,
    startsAt: karachiDateTimeField,
    endsAt: karachiDateTimeField,
    isActive: activeField,
  })
  .superRefine((value, ctx) => {
    checkValueRange(value.type, value.value, ctx);
    checkDateOrder(value.startsAt, value.endsAt, ctx);
    if (value.minOrder !== null && decimalToPaisa(value.minOrder) <= 0) {
      ctx.addIssue({ code: "custom", path: ["minOrder"], message: "Leave blank for no minimum, or enter an amount above 0." });
    }
    if (value.maxDiscount !== null) {
      if (value.type !== "percent") {
        ctx.addIssue({ code: "custom", path: ["maxDiscount"], message: "A maximum discount cap applies to percentage coupons only." });
      } else if (decimalToPaisa(value.maxDiscount) <= 0) {
        ctx.addIssue({ code: "custom", path: ["maxDiscount"], message: "Leave blank for no cap, or enter an amount above 0." });
      }
    }
  });

export type CouponInput = z.infer<typeof couponInputSchema>;

// ── The list ────────────────────────────────────────────────────────────────────────────────────

export const COUPON_TABS = ["all", "active", "scheduled", "expired", "used_up", "inactive"] as const;
export type CouponTab = (typeof COUPON_TABS)[number];

// Next hands repeated query keys over as arrays (?q=a&q=b); only the first counts.
const firstQueryValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const COUPON_PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
export const COUPON_DEFAULT_PAGE_SIZE: (typeof COUPON_PAGE_SIZE_OPTIONS)[number] = 25;

export const couponListQuerySchema = z.object({
  tab: z.preprocess(firstQueryValue, z.enum(COUPON_TABS)).catch("all"),
  q: z.preprocess(firstQueryValue, z.string().trim().max(100).optional()).catch(undefined),
  page: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
  pageSize: z
    .preprocess(firstQueryValue, z.coerce.number().int())
    .refine((value): value is (typeof COUPON_PAGE_SIZE_OPTIONS)[number] => (COUPON_PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
    .catch(COUPON_DEFAULT_PAGE_SIZE),
});
export type CouponListQuery = z.infer<typeof couponListQuerySchema>;

/** The list the create/edit page was opened from, for its back link: only the coupons list with its own query string. */
export const couponBackHrefSchema = z
  .preprocess(firstQueryValue, z.string().max(300).regex(/^\/panel\/coupons(\?[\w=&%.+-]*)?$/).optional())
  .catch(undefined);
