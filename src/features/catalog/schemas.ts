import { z } from "zod";
import { decimalToPaisa, paisaToDecimal } from "@/features/pricing/money";
import { SHOP_SORTS } from "./listing";
import { SLUG_PATTERN } from "./slug";
import { ATTRIBUTE_SLOTS, generateVariantLabel, validateAttributePairs } from "./variants";

export { variantAttributesSchema } from "./variants";

// Next hands repeated query keys over as arrays (?sort=a&sort=b); only the first counts.
const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** Shop/category query string. A bad value falls back to its default instead of erroring. */
export const listingQuerySchema = z.object({
  q: z.preprocess(firstValue, z.string().trim().max(100).optional()).catch(undefined),
  category: z.preprocess(firstValue, z.string().max(191).optional()).catch(undefined),
  sort: z.preprocess(firstValue, z.enum(SHOP_SORTS)).catch("recommended"),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

export type ListingQuery = z.infer<typeof listingQuerySchema>;

export const slugSchema = z.string().min(1).max(191);

// ── Panel: categories CRUD (S10 phase 1) ───────────────────────────────────────────────────────

/** `""`/missing -> `null`, so an empty optional field is stored as NULL rather than an empty string. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

/** "" or missing -> no parent; otherwise a positive category id (resolved and checked server-side). */
const parentIdField = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().int().positive().nullable(),
);

const activeField = z.preprocess((value) => value === "true" || value === true, z.boolean());

/**
 * Shared by the client form (field-level errors as the admin types) and the Server Action (the
 * only check that matters): name, a URL-safe unique slug, an optional short description and image,
 * sort order, the active toggle, and an optional top-level parent (one level of nesting only — the
 * service layer re-checks this under the row lock, since `parentId` alone can't express "the
 * parent itself has no parent" or "this category already has children").
 */
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(150, "Keep this under 150 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter a slug.")
    .max(191, "Keep this under 191 characters.")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single dashes only."),
  description: optionalText(500),
  imagePath: optionalText(255),
  sortOrder: z.coerce.number().int("Enter a whole number.").min(0, "Use 0 or higher.").max(100_000, "Enter a smaller number."),
  isActive: activeField,
  parentId: parentIdField,
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

// Next hands repeated query keys over as arrays (?q=a&q=b); only the first counts.
const firstQueryValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const CATEGORY_PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
export const CATEGORY_DEFAULT_PAGE_SIZE: (typeof CATEGORY_PAGE_SIZE_OPTIONS)[number] = 25;

export const categoryListQuerySchema = z.object({
  q: z.preprocess(firstQueryValue, z.string().trim().max(100).optional()).catch(undefined),
  page: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
  pageSize: z
    .preprocess(firstQueryValue, z.coerce.number().int())
    .refine((value): value is (typeof CATEGORY_PAGE_SIZE_OPTIONS)[number] => (CATEGORY_PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
    .catch(CATEGORY_DEFAULT_PAGE_SIZE),
});

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;

/** The list the create/edit page was opened from, for its back link: only the categories list with its own query string. */
export const categoryBackHrefSchema = z
  .preprocess(firstQueryValue, z.string().max(300).regex(/^\/panel\/categories(\?[\w=&%.+-]*)?$/).optional())
  .catch(undefined);

// ── Panel: products CRUD (S10 phase 2) ──────────────────────────────────────────────────────────

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * A PKR amount typed as plain text, round-tripped through the paisa helpers (CLAUDE.md #6: never a
 * float) so only a normalised DECIMAL(12,2) string (e.g. "1500.00") is ever stored or compared.
 */
const moneyField = (message = "Enter a valid amount, e.g. 1500 or 1500.00.") =>
  z
    .string()
    .trim()
    .regex(MONEY_PATTERN, message)
    .transform((value) => paisaToDecimal(decimalToPaisa(value)));

/** `""`/missing -> `null`, so an optional override is stored as NULL rather than an empty string. */
const optionalMoneyField = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z
    .string()
    .trim()
    .regex(MONEY_PATTERN, "Enter a valid amount, e.g. 1500 or 1500.00.")
    .transform((value) => paisaToDecimal(decimalToPaisa(value)))
    .nullable(),
);

/** `""`/missing -> `null`, same shape as `optionalText` above but for an integer field (weight in grams). */
const optionalInt = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.coerce.number().int("Enter a whole number.").min(0, "Use 0 or higher.").max(max, "Enter a smaller number.").nullable(),
  );

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(150, "Keep this under 150 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter a slug.")
    .max(191, "Keep this under 191 characters.")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single dashes only."),
  categoryId: z.coerce.number().int("Choose a category.").positive("Choose a category."),
  shortDescription: optionalText(500),
  description: optionalText(5000),
  price: moneyField(),
  weightGrams: optionalInt(100_000),
  status: z.enum(PRODUCT_STATUSES),
  isFeatured: activeField,
  // `MediaImageField`'s hidden inputs are named from its `name` prop ("imagePath" here), so the
  // width/height companions it actually posts are "imagePathWidth"/"imagePathHeight" — matching
  // that, not a shorter guess, is what makes the image row actually get inserted/updated.
  imagePath: optionalText(255),
  imagePathWidth: optionalInt(20_000),
  imagePathHeight: optionalInt(20_000),
});

export type ProductInput = z.infer<typeof productInputSchema>;

const skuField = z.string().trim().min(1, "Enter a SKU.").max(64, "Keep this under 64 characters.");
const stockField = z.coerce.number().int("Enter a whole number.").min(0, "Use 0 or higher.").max(1_000_000, "Enter a smaller number.");

/** The create form's one "Default" variant (SKU + stock); every later variant goes through `variantInputSchema`. */
export const defaultVariantCreateSchema = z.object({ sku: skuField, stock: stockField });

export type DefaultVariantCreateInput = z.infer<typeof defaultVariantCreateSchema>;

// ── Panel: variant CRUD (S10 phase 3a) ──────────────────────────────────────────────────────────

/** `""`/missing -> `""`: an attribute row the dialog left blank, or a label left for auto-generation. */
const blankableText = (max: number, message: string) => z.preprocess((value) => (value === null || value === undefined ? "" : value), z.string().trim().max(max, message));

/**
 * The Add/Edit variant dialog posts its attribute rows as `attributeKey0`/`attributeValue0` …
 * `attributeKey4`/`attributeValue4` (one pair per row, `MAX_VARIANT_ATTRIBUTES` rows) — plain
 * indexed fields rather than a JSON blob, so a test can post the literal wire format.
 */
const attributeFields = Object.fromEntries(
  ATTRIBUTE_SLOTS.flatMap((index) => [
    [`attributeKey${index}`, blankableText(40, "Keep attribute names under 40 characters.")],
    [`attributeValue${index}`, blankableText(80, "Keep attribute values under 80 characters.")],
  ]),
);

/**
 * Shared by the dialog (field errors as the Developer types) and the Server Action (the only check
 * that matters). Attribute rows are validated by `validateAttributePairs` (trimmed, no half-filled
 * row, no duplicate name, at most five); a blank label is auto-generated from the attribute values
 * ("Red / Large", or "Default" with none). SKU uniqueness and the same-attributes rule against the
 * product's other variants need the rows, so the service checks them under the row lock.
 */
export const variantInputSchema = z
  .object({
    label: blankableText(150, "Keep this under 150 characters."),
    sku: skuField,
    priceOverride: optionalMoneyField,
    stock: stockField,
    weightGrams: optionalInt(100_000),
    isActive: activeField,
    ...attributeFields,
  })
  .superRefine((value, ctx) => {
    const { errors } = validateAttributePairs(attributePairsOf(value));
    for (const error of errors) {
      ctx.addIssue({ code: "custom", path: [`attribute${error.field === "key" ? "Key" : "Value"}${error.index}`], message: error.message });
    }
  })
  .transform((value) => {
    const { attributes } = validateAttributePairs(attributePairsOf(value));
    return {
      label: value.label || generateVariantLabel(attributes),
      sku: value.sku,
      priceOverride: value.priceOverride,
      stock: value.stock,
      weightGrams: value.weightGrams,
      isActive: value.isActive,
      attributes,
    };
  });

function attributePairsOf(value: Record<string, unknown>): { key: string; value: string }[] {
  return ATTRIBUTE_SLOTS.map((index) => ({ key: String(value[`attributeKey${index}`] ?? ""), value: String(value[`attributeValue${index}`] ?? "") }));
}

export type VariantInput = z.infer<typeof variantInputSchema>;

/** The list row's inline "adjust stock" control. */
export const variantStockSchema = z.object({ stock: stockField });

/** The variants list's drag-drop save: called directly from the client (not a `<form>`), same shape as the arrange page's. */
export const saveVariantOrderSchema = z.object({
  productId: z.coerce.number().int().positive(),
  orderedIds: z
    .array(z.coerce.number().int().positive())
    .max(200, "Too many variants in one save.")
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate variant id."),
});
export type SaveVariantOrderInput = z.infer<typeof saveVariantOrderSchema>;

export const PRODUCT_TABS = ["all", ...PRODUCT_STATUSES] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

export const PRODUCT_PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
export const PRODUCT_DEFAULT_PAGE_SIZE: (typeof PRODUCT_PAGE_SIZE_OPTIONS)[number] = 25;

export const productListQuerySchema = z.object({
  tab: z.preprocess(firstQueryValue, z.enum(PRODUCT_TABS)).catch("all"),
  q: z.preprocess(firstQueryValue, z.string().trim().max(100).optional()).catch(undefined),
  category: z.preprocess(firstQueryValue, z.coerce.number().int().positive().optional()).catch(undefined),
  page: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
  pageSize: z
    .preprocess(firstQueryValue, z.coerce.number().int())
    .refine((value): value is (typeof PRODUCT_PAGE_SIZE_OPTIONS)[number] => (PRODUCT_PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
    .catch(PRODUCT_DEFAULT_PAGE_SIZE),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

/** The list the create/edit page was opened from, for its back link: only the products list with its own query string. */
export const productBackHrefSchema = z
  .preprocess(firstQueryValue, z.string().max(300).regex(/^\/panel\/products(\?[\w=&%.+-]*)?$/).optional())
  .catch(undefined);

// ── Panel: manual ordering placement (S10 phase 2b) ─────────────────────────────────────────────

export const PLACEMENT_CREATE = ["top", "end", "position"] as const;
export const PLACEMENT_EDIT = ["keep", "top", "end", "position"] as const;
export type PlacementCreate = (typeof PLACEMENT_CREATE)[number];
export type PlacementEdit = (typeof PLACEMENT_EDIT)[number];

/** `""`/missing -> `undefined`, so a position left blank isn't coerced to 0/NaN. */
const optionalPosition = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int("Enter a whole number.").min(1, "Use 1 or higher.").optional(),
);

/** The create form's "Show in shop" radio group; End is the default, Position requires a number. */
export const shopPlacementCreateSchema = z
  .object({ shopPlacement: z.enum(PLACEMENT_CREATE).catch("end"), shopPosition: optionalPosition })
  .refine((value) => value.shopPlacement !== "position" || value.shopPosition !== undefined, { message: "Enter a position.", path: ["shopPosition"] });
export type ShopPlacementInput = z.infer<typeof shopPlacementCreateSchema>;

/** The create form's "Show in featured strip" radio group — only parsed while Featured is on. */
export const featuredPlacementCreateSchema = z
  .object({ featuredPlacement: z.enum(PLACEMENT_CREATE).catch("end"), featuredPosition: optionalPosition })
  .refine((value) => value.featuredPlacement !== "position" || value.featuredPosition !== undefined, {
    message: "Enter a position.",
    path: ["featuredPosition"],
  });
export type FeaturedPlacementInput = z.infer<typeof featuredPlacementCreateSchema>;

/** The edit form's version: "Keep current position" is the default, so the rest of the form never silently moves it. */
export const shopPlacementEditSchema = z
  .object({ shopPlacement: z.enum(PLACEMENT_EDIT).catch("keep"), shopPosition: optionalPosition })
  .refine((value) => value.shopPlacement !== "position" || value.shopPosition !== undefined, { message: "Enter a position.", path: ["shopPosition"] });
export type ShopPlacementEditInput = z.infer<typeof shopPlacementEditSchema>;

export const featuredPlacementEditSchema = z
  .object({ featuredPlacement: z.enum(PLACEMENT_EDIT).catch("keep"), featuredPosition: optionalPosition })
  .refine((value) => value.featuredPlacement !== "position" || value.featuredPosition !== undefined, {
    message: "Enter a position.",
    path: ["featuredPosition"],
  });
export type FeaturedPlacementEditInput = z.infer<typeof featuredPlacementEditSchema>;

/** The arrange page's per-row "Move to…" quick action and its drag-drop save, same placement shape. */
export const moveToPlacementSchema = z
  .object({ placement: z.enum(PLACEMENT_CREATE), position: optionalPosition })
  .refine((value) => value.placement !== "position" || value.position !== undefined, { message: "Enter a position.", path: ["position"] });
export type MoveToPlacementInput = z.infer<typeof moveToPlacementSchema>;

/** `/panel/products/arrange`'s full drag-drop save: called directly from the client (not a `<form>`), so this is the one boundary check its payload gets. */
const orderedIdsSchema = z
  .array(z.coerce.number().int().positive())
  .max(500, "Too many products in one save.")
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate product id.");

export const saveShopOrderSchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  orderedIds: orderedIdsSchema,
});
export type SaveShopOrderInput = z.infer<typeof saveShopOrderSchema>;

export const saveFeaturedOrderSchema = z.object({ orderedIds: orderedIdsSchema });
export type SaveFeaturedOrderInput = z.infer<typeof saveFeaturedOrderSchema>;
