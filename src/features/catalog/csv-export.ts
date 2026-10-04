/**
 * Product CSV export (S18): one row per variant, product columns repeated. Shares its header row
 * and column order with the CSV import template (`csv-import-schema.ts`) so the import template
 * is literally this export's own shape.
 */
import { buildCsv } from "@/features/csv/writer";
import { PRODUCT_IMPORT_EXAMPLE_ROW, PRODUCT_IMPORT_HEADERS } from "./csv-import-schema";
import { listProductsForExport, type ProductExportRow } from "./products-staff-repo";
import type { ProductTab } from "./schemas";
import { parseVariantAttributes } from "./variants";

const PRODUCT_EXPORT_ROW_CAP = 5000;

function attributesCell(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

function toValues(row: ProductExportRow): string[] {
  return [
    row.name,
    row.slug,
    row.categorySlug,
    row.status,
    row.shortDescription ?? "",
    row.description ?? "",
    String(row.isFeatured),
    row.price,
    row.sku,
    row.label,
    attributesCell(parseVariantAttributes(row.attributes)),
    String(row.stock),
    row.priceOverride ?? "",
    String(row.isActive),
  ];
}

export async function buildProductExportCsv(filter: { tab: ProductTab; q?: string; categoryId?: number }): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
  const { rows, truncated } = await listProductsForExport({ ...filter, limit: PRODUCT_EXPORT_ROW_CAP });
  return { csv: buildCsv(PRODUCT_IMPORT_HEADERS, rows.map(toValues)), rowCount: rows.length, truncated };
}

/** The import page's downloadable template: the export's own header plus one example row. */
export function buildProductImportTemplateCsv(): string {
  return buildCsv(PRODUCT_IMPORT_HEADERS, [PRODUCT_IMPORT_EXAMPLE_ROW]);
}
