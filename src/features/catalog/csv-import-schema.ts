/**
 * Product CSV import/export column shape (S18): one row per variant, product columns repeated.
 * `validateImportRow` reuses the same pure rules the panel forms already validate against
 * (`SLUG_PATTERN`, `moneyField`/`optionalMoneyField`, `skuField`/`stockField`,
 * `validateAttributePairs`) rather than re-deriving them, so a row that would be refused by the
 * product/variant forms is refused here for the same reason. Cross-row and cross-database checks
 * (slug/SKU uniqueness, category existence, the last-active-variant rule) are
 * `csv-import-service.ts`'s job — this file only validates one row's columns in isolation.
 */
import { moneyField, optionalMoneyField } from "@/features/pricing/schemas";
import { PRODUCT_STATUSES, skuField, stockField, type ProductStatus } from "./schemas";
import { SLUG_PATTERN } from "./slug";
import { generateVariantLabel, validateAttributePairs, type AttributePair } from "./variants";

export const PRODUCT_IMPORT_HEADERS = [
  "Product name",
  "Slug",
  "Category slug",
  "Status",
  "Short description",
  "Description",
  "Featured",
  "Base price",
  "Variant SKU",
  "Variant label",
  "Attributes",
  "Stock",
  "Price override",
  "Variant active",
] as const;

export type ProductImportHeader = (typeof PRODUCT_IMPORT_HEADERS)[number];

export const PRODUCT_IMPORT_EXAMPLE_ROW: readonly string[] = [
  "Ceramic Dinner Plate",
  "ceramic-dinner-plate",
  "tableware",
  "active",
  "A handcrafted ceramic dinner plate.",
  "A handcrafted ceramic dinner plate finished with a matte glaze.",
  "false",
  "1500.00",
  "CDP-WHT-01",
  "White",
  "Colour:White",
  "25",
  "",
  "true",
];

export type ProductImportRow = {
  name: string;
  slug: string;
  categorySlug: string;
  status: ProductStatus;
  shortDescription: string | null;
  description: string | null;
  isFeatured: boolean;
  price: string;
  sku: string;
  label: string;
  attributes: Record<string, string>;
  stock: number;
  priceOverride: string | null;
  isActive: boolean;
};

export type RowIssue = { row: number; column: string; message: string };

function booleanCell(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

/** "Key:Value;Key:Value" -> pairs; a part with no `:` is reported by the caller as malformed. */
function parseAttributesCell(cell: string): { pairs: AttributePair[]; malformed: boolean } {
  const trimmed = cell.trim();
  if (!trimmed) return { pairs: [], malformed: false };
  const parts = trimmed.split(";").map((part) => part.trim()).filter(Boolean);
  const pairs: AttributePair[] = [];
  let malformed = false;
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx === -1) {
      malformed = true;
      continue;
    }
    pairs.push({ key: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() });
  }
  return { pairs, malformed };
}

function textField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Validates one row's columns in isolation (no DB access). `row` is keyed by the file's own header names. */
export function validateImportRow(row: Record<string, string>, rowNumber: number): { value: ProductImportRow | null; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const get = (column: ProductImportHeader) => row[column] ?? "";
  const fail = (column: ProductImportHeader, message: string) => issues.push({ row: rowNumber, column, message });

  const name = get("Product name").trim();
  if (!name) fail("Product name", "Enter a product name.");
  else if (name.length > 150) fail("Product name", "Keep this under 150 characters.");

  const slug = get("Slug").trim().toLowerCase();
  if (!slug) fail("Slug", "Enter a slug.");
  else if (slug.length > 191) fail("Slug", "Keep this under 191 characters.");
  else if (!SLUG_PATTERN.test(slug)) fail("Slug", "Use lowercase letters, numbers and single dashes only.");

  const categorySlug = get("Category slug").trim().toLowerCase();
  if (!categorySlug) fail("Category slug", "Enter a category slug.");

  const statusRaw = get("Status").trim().toLowerCase();
  const status = (PRODUCT_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as ProductStatus) : null;
  if (!status) fail("Status", "Status must be draft, active or archived.");

  const shortDescriptionRaw = get("Short description");
  if (shortDescriptionRaw.trim().length > 500) fail("Short description", "Keep this under 500 characters.");
  const descriptionRaw = get("Description");
  if (descriptionRaw.trim().length > 5000) fail("Description", "Keep this under 5000 characters.");

  const isFeatured = booleanCell(get("Featured"));
  if (isFeatured === null) fail("Featured", "Use true or false.");

  const priceResult = moneyField().safeParse(get("Base price").trim());
  if (!priceResult.success) fail("Base price", priceResult.error.issues[0]?.message ?? "Enter a valid amount, e.g. 1500 or 1500.00.");

  const skuResult = skuField.safeParse(get("Variant SKU"));
  if (!skuResult.success) fail("Variant SKU", skuResult.error.issues[0]?.message ?? "Enter a SKU.");

  const label = get("Variant label").trim().slice(0, 150);

  const { pairs, malformed } = parseAttributesCell(get("Attributes"));
  if (malformed) fail("Attributes", 'Use "Key:Value" pairs separated by semicolons, e.g. "Colour:White;Size:Large".');
  const { attributes, errors: attributeErrors } = validateAttributePairs(pairs);
  for (const error of attributeErrors) fail("Attributes", error.message);

  const stockResult = stockField.safeParse(get("Stock"));
  if (!stockResult.success) fail("Stock", stockResult.error.issues[0]?.message ?? "Enter a whole number.");

  const priceOverrideResult = optionalMoneyField.safeParse(get("Price override").trim());
  if (!priceOverrideResult.success) fail("Price override", priceOverrideResult.error.issues[0]?.message ?? "Enter a valid amount, e.g. 1500 or 1500.00.");

  const isActive = booleanCell(get("Variant active"));
  if (isActive === null) fail("Variant active", "Use true or false.");

  if (issues.length > 0) return { value: null, issues };

  return {
    value: {
      name,
      slug,
      categorySlug,
      status: status!,
      shortDescription: textField(shortDescriptionRaw),
      description: textField(descriptionRaw),
      isFeatured: isFeatured!,
      price: priceResult.success ? priceResult.data : "0.00",
      sku: skuResult.success ? skuResult.data : "",
      label: label || generateVariantLabel(attributes),
      attributes,
      stock: stockResult.success ? stockResult.data : 0,
      priceOverride: priceOverrideResult.success ? priceOverrideResult.data : null,
      isActive: isActive!,
    },
    issues: [],
  };
}
