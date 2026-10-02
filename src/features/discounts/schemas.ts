import { z } from "zod";
import { decimalToPaisa } from "@/features/pricing/money";
import { moneyField } from "@/features/pricing/schemas";
import { karachiLocalToUtc } from "@/lib/karachi-datetime";

export const DISCOUNT_TYPES = ["percent", "fixed"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_TARGET_TYPES = ["all", "category", "product"] as const;
export type DiscountTargetType = (typeof DISCOUNT_TARGET_TYPES)[number];

/** The products picker's cap (owner brief, S12). */
export const MAX_DISCOUNT_PRODUCTS = 100;

const activeField = z.preprocess((value) => value === "true" || value === true, z.boolean());

/**
 * `""`/missing -> `null`; otherwise a `datetime-local` value read as Karachi time (+05:00). Shared
 * by the discounts and coupons forms, whose start/end windows follow the same convention.
 */
export const karachiDateTimeField = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const date = karachiLocalToUtc(value);
      if (!date) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date and time." });
        return z.NEVER;
      }
      return date;
    })
    .nullable(),
);

/** `""`/missing -> `null`; otherwise a positive id (the category Listbox's hidden input). */
const optionalIdField = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().int().positive().nullable(),
);

/**
 * The products multi-select posts its chosen ids as one comma-separated hidden field
 * ("12,40,7") — a literal wire format a test can post as-is — rather than repeated keys, which
 * `Object.fromEntries(formData)` would collapse to the last one.
 */
const productIdsField = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  z
    .string()
    .trim()
    .transform((value, ctx): number[] => {
      if (value === "") return [];
      const ids = value.split(",").map((part) => Number(part.trim()));
      if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
        ctx.addIssue({ code: "custom", message: "One of the chosen products isn't valid." });
        return z.NEVER;
      }
      const unique = [...new Set(ids)];
      if (unique.length > MAX_DISCOUNT_PRODUCTS) {
        ctx.addIssue({ code: "custom", message: `Choose at most ${MAX_DISCOUNT_PRODUCTS} products.` });
        return z.NEVER;
      }
      return unique;
    }),
);

/** Percent in 1–100 (value in hundredths of a percent once decimal-converted); a fixed amount above 0. */
export function checkValueRange(type: DiscountType, value: string, ctx: z.RefinementCtx, path = "value"): void {
  const amount = decimalToPaisa(value);
  if (type === "percent" && (amount < 100 || amount > 10_000)) {
    ctx.addIssue({ code: "custom", path: [path], message: "A percentage must be between 1 and 100." });
  }
  if (type === "fixed" && amount <= 0) {
    ctx.addIssue({ code: "custom", path: [path], message: "A fixed amount must be more than 0." });
  }
}

/** Both set -> the end must come after the start. */
export function checkDateOrder(startsAt: Date | null, endsAt: Date | null, ctx: z.RefinementCtx): void {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start." });
  }
}

/**
 * Shared by the form (field errors as the Developer types) and the Server Action (the only check
 * that matters). Target existence (every id is a real category/product) needs the rows, so the
 * service re-checks that under the row lock; this schema only pins the shape.
 */
export const discountInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(150, "Keep this under 150 characters."),
    type: z.enum(DISCOUNT_TYPES, { error: "Choose a type." }),
    value: moneyField("Enter a value, e.g. 10 or 500."),
    targetType: z.enum(DISCOUNT_TARGET_TYPES, { error: "Choose what the discount applies to." }),
    categoryId: optionalIdField,
    productIds: productIdsField,
    startsAt: karachiDateTimeField,
    endsAt: karachiDateTimeField,
    isActive: activeField,
  })
  .superRefine((value, ctx) => {
    checkValueRange(value.type, value.value, ctx);
    checkDateOrder(value.startsAt, value.endsAt, ctx);
    if (value.targetType === "category" && value.categoryId === null) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category." });
    }
    if (value.targetType === "product" && value.productIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["productIds"], message: "Choose at least one product." });
    }
  })
  .transform((value) => ({
    name: value.name,
    type: value.type,
    value: value.value,
    targetType: value.targetType,
    // Discounts never target a single variant (DIS-05): the ids are categories or products only.
    targetIds: value.targetType === "category" ? [value.categoryId!] : value.targetType === "product" ? value.productIds : [],
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    isActive: value.isActive,
  }));

export type DiscountInput = z.infer<typeof discountInputSchema>;

/** The overlap hint's request, called directly from the form (not a `<form>` post). */
export const discountOverlapQuerySchema = z.object({
  targetType: z.enum(DISCOUNT_TARGET_TYPES),
  categoryId: optionalIdField,
  productIds: productIdsField,
  /** The discount being edited, left out of its own hint. */
  excludeId: optionalIdField,
});
export type DiscountOverlapQuery = z.infer<typeof discountOverlapQuerySchema>;

// ── The list ────────────────────────────────────────────────────────────────────────────────────

export const DISCOUNT_TABS = ["all", "active", "scheduled", "expired", "inactive"] as const;
export type DiscountTab = (typeof DISCOUNT_TABS)[number];

// Next hands repeated query keys over as arrays (?q=a&q=b); only the first counts.
const firstQueryValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const DISCOUNT_PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
export const DISCOUNT_DEFAULT_PAGE_SIZE: (typeof DISCOUNT_PAGE_SIZE_OPTIONS)[number] = 25;

export const discountListQuerySchema = z.object({
  tab: z.preprocess(firstQueryValue, z.enum(DISCOUNT_TABS)).catch("all"),
  q: z.preprocess(firstQueryValue, z.string().trim().max(100).optional()).catch(undefined),
  page: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
  pageSize: z
    .preprocess(firstQueryValue, z.coerce.number().int())
    .refine((value): value is (typeof DISCOUNT_PAGE_SIZE_OPTIONS)[number] => (DISCOUNT_PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
    .catch(DISCOUNT_DEFAULT_PAGE_SIZE),
});
export type DiscountListQuery = z.infer<typeof discountListQuerySchema>;

/** The list the create/edit page was opened from, for its back link: only the discounts list with its own query string. */
export const discountBackHrefSchema = z
  .preprocess(firstQueryValue, z.string().max(300).regex(/^\/panel\/discounts(\?[\w=&%.+-]*)?$/).optional())
  .catch(undefined);
