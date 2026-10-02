import { z } from "zod";
import { decimalToPaisa, paisaToDecimal } from "@/features/pricing/money";
import { SHOP_SORTS } from "./listing";
import { SLUG_PATTERN } from "./slug";

// Next hands repeated query keys over as arrays (?sort=a&sort=b); only the first counts.
const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** Shop/category query string. A bad value falls back to its default instead of erroring. */
export const listingQuerySchema = z.object({
  q: z.preprocess(firstValue, z.string().trim().max(100).optional()).catch(undefined),
  category: z.preprocess(firstValue, z.string().max(191).optional()).catch(undefined),
  sort: z.preprocess(firstValue, z.enum(SHOP_SORTS)).catch("newest"),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

export type ListingQuery = z.infer<typeof listingQuerySchema>;

export const slugSchema = z.string().min(1).max(191);

/** product_variants.attributes, e.g. {"Colour":"Red","Size":"Large"} (DATABASE.md DB2). */
export const variantAttributesSchema = z.record(z.string(), z.string());

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

/** The default variant's own fields, created alongside the product (S10 phase 2: one variant only). */
export const defaultVariantCreateSchema = z.object({
  sku: z.string().trim().min(1, "Enter a SKU.").max(64, "Keep this under 64 characters."),
  stock: z.coerce.number().int("Enter a whole number.").min(0, "Use 0 or higher."),
});

/** On edit, the single default variant also exposes its price override (not offered on create). */
export const defaultVariantEditSchema = defaultVariantCreateSchema.extend({
  priceOverride: optionalMoneyField,
});

export type DefaultVariantCreateInput = z.infer<typeof defaultVariantCreateSchema>;
export type DefaultVariantEditInput = z.infer<typeof defaultVariantEditSchema>;

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
