/**
 * Product CSV import (S18), two steps: "check" (`checkProductImport`) parses and validates
 * everything and writes nothing; "commit" (`commitProductImport`) re-validates the identical file
 * fresh (never trusting the check step's report) and, only when there are zero errors, writes
 * every product/variant in one transaction through the same repo functions the panel forms use
 * (`insertProduct`/`updateProduct`/`insertVariant`/`updateVariant`), locking each product row (and
 * then its variants) before writing, exactly like `products-staff-service.ts`/
 * `variants-staff-service.ts` do. A product is matched by slug, a variant by SKU; variants absent
 * from the file are left untouched (never deleted); images and order history are never touched.
 */
import { insertAuditLog } from "@/features/audit/repo";
import { parseCsv } from "@/features/csv/parser";
import { env } from "@/server/env";
import { db } from "@/server/db/client";
import { PRODUCT_IMPORT_HEADERS, validateImportRow, type ProductImportRow, type RowIssue } from "./csv-import-schema";
import { decodeImportCheckToken, encodeImportCheckToken, hashFile, IMPORT_CHECK_TOKEN_TTL_MS } from "./import-token";
import { getCategoryBySlugActive, getMaxSortOrders, getProductBySlug, insertProduct, lockProductById, updateProduct, type ProductRow } from "./products-staff-repo";
import { getVariantBySku, getVariantsByProductId, insertVariant, lockVariantsByProductId, updateVariant } from "./variants-staff-repo";
import { sameAttributes } from "./variants";

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;

export type ImportReport = {
  totalRows: number;
  toCreateProducts: number;
  toUpdateProducts: number;
  toCreateVariants: number;
  toUpdateVariants: number;
  rowErrors: RowIssue[];
  rowWarnings: RowIssue[];
};

type ValidRow = { rowNumber: number; value: ProductImportRow };
type ProductGroup = { slug: string; rows: ValidRow[] };

function parseHeaderRow(header: string[]): { ok: true } | { ok: false; error: string } {
  const given = new Set(header.map((h) => h.trim()));
  const expected: readonly string[] = PRODUCT_IMPORT_HEADERS;
  const missing = expected.filter((h) => !given.has(h));
  const unexpected = [...given].filter((h) => !expected.includes(h));
  if (missing.length > 0) return { ok: false, error: `Missing column(s): ${missing.join(", ")}.` };
  if (unexpected.length > 0) return { ok: false, error: `Unknown column(s): ${unexpected.join(", ")}.` };
  return { ok: true };
}

/** The product-level fields a slug's rows must agree on — one product record per slug. */
const PRODUCT_LEVEL_FIELDS: { key: keyof ProductImportRow; column: string }[] = [
  { key: "name", column: "Product name" },
  { key: "categorySlug", column: "Category slug" },
  { key: "status", column: "Status" },
  { key: "shortDescription", column: "Short description" },
  { key: "description", column: "Description" },
  { key: "isFeatured", column: "Featured" },
  { key: "price", column: "Base price" },
];

function productFieldMismatches(group: ProductGroup): RowIssue[] {
  const [first, ...rest] = group.rows;
  const issues: RowIssue[] = [];
  for (const entry of rest) {
    for (const field of PRODUCT_LEVEL_FIELDS) {
      if (entry.value[field.key] !== first.value[field.key]) {
        issues.push({
          row: entry.rowNumber,
          column: field.column,
          message: `Differs from row ${first.rowNumber} for the same slug "${group.slug}" — every variant row of one product must repeat the same product columns.`,
        });
      }
    }
  }
  return issues;
}

type CheckedFile = { report: ImportReport; groups: Map<string, ProductGroup> } | { fileError: string };

async function runChecks(text: string): Promise<CheckedFile> {
  const rows2d = parseCsv(text);
  if (rows2d.length === 0) return { fileError: "The file is empty." };
  const [header, ...dataRows] = rows2d;
  if (dataRows.length === 0) return { fileError: "The file has no data rows." };
  if (dataRows.length > MAX_IMPORT_ROWS) return { fileError: `The file has more than ${MAX_IMPORT_ROWS} rows.` };

  const headerCheck = parseHeaderRow(header);
  if (!headerCheck.ok) return { fileError: headerCheck.error };
  const trimmedHeader = header.map((h) => h.trim());

  const rowErrors: RowIssue[] = [];
  const rowWarnings: RowIssue[] = [];
  const valid: ValidRow[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== trimmedHeader.length) {
      rowErrors.push({ row: rowNumber, column: "Row", message: "This row doesn't have the right number of columns." });
      return;
    }
    const record: Record<string, string> = {};
    trimmedHeader.forEach((column, i) => {
      record[column] = row[i] ?? "";
    });
    const { value, issues } = validateImportRow(record, rowNumber);
    rowErrors.push(...issues);
    if (value) valid.push({ rowNumber, value });
  });

  // SKU uniqueness within the file (every variant's SKU is unique store-wide).
  // Case-insensitively, like the unique index under utf8mb4_unicode_ci (S22 BUG-11).
  const skuRows = new Map<string, number[]>();
  for (const entry of valid) skuRows.set(skuKey(entry.value.sku), [...(skuRows.get(skuKey(entry.value.sku)) ?? []), entry.rowNumber]);
  for (const [sku, rowNumbers] of skuRows) {
    if (rowNumbers.length > 1) {
      for (const rowNumber of rowNumbers) rowErrors.push({ row: rowNumber, column: "Variant SKU", message: `Duplicate SKU "${sku}" in this file (rows ${rowNumbers.join(", ")}).` });
    }
  }

  const groups = new Map<string, ProductGroup>();
  for (const entry of valid) {
    const group = groups.get(entry.value.slug) ?? { slug: entry.value.slug, rows: [] };
    group.rows.push(entry);
    groups.set(entry.value.slug, group);
  }

  const mismatchedSlugs = new Set<string>();
  for (const group of groups.values()) {
    const mismatches = productFieldMismatches(group);
    if (mismatches.length > 0) mismatchedSlugs.add(group.slug);
    rowErrors.push(...mismatches);
  }

  // Attribute-set uniqueness within a product group (mirrors `variants-staff-service.ts`'s `assertAttributesUnique`).
  for (const group of groups.values()) {
    group.rows.forEach((entry, i) => {
      const clash = group.rows.find((other, j) => j < i && sameAttributes(other.value.attributes, entry.value.attributes));
      if (clash) rowErrors.push({ row: entry.rowNumber, column: "Attributes", message: `Row ${clash.rowNumber} already has exactly these attributes for product "${group.slug}".` });
    });
  }

  let toCreateProducts = 0;
  let toUpdateProducts = 0;
  let toCreateVariants = 0;
  let toUpdateVariants = 0;

  for (const group of groups.values()) {
    if (mismatchedSlugs.has(group.slug)) continue;

    const first = group.rows[0].value;
    const category = await getCategoryBySlugActive(first.categorySlug);
    if (!category || !category.isActive) {
      for (const entry of group.rows) rowErrors.push({ row: entry.rowNumber, column: "Category slug", message: "That category doesn't exist or is hidden." });
      continue;
    }

    const existingProduct = await getProductBySlug(group.slug);
    if (existingProduct) toUpdateProducts++;
    else toCreateProducts++;

    const existingVariants = existingProduct ? await getVariantsByProductId(db, existingProduct.id) : [];
    const fileSkus = new Set(group.rows.map((entry) => skuKey(entry.value.sku)));
    const untouchedActiveRemains = existingVariants.some((row) => !fileSkus.has(skuKey(row.sku)) && row.isActive);

    let anyFileRowActive = false;
    for (const entry of group.rows) {
      const existingVariant = await getVariantBySku(entry.value.sku);
      if (existingVariant) {
        if (!existingProduct || existingVariant.productId !== existingProduct.id) {
          rowErrors.push({ row: entry.rowNumber, column: "Variant SKU", message: "That SKU already belongs to a different product." });
        } else {
          toUpdateVariants++;
        }
      } else {
        toCreateVariants++;
      }
      if (entry.value.isActive) anyFileRowActive = true;
    }

    if (first.status === "active" && !anyFileRowActive && !untouchedActiveRemains) {
      rowErrors.push({ row: group.rows[0].rowNumber, column: "Variant active", message: "At least one variant of an active product must stay active." });
    }
  }

  return {
    report: { totalRows: dataRows.length, toCreateProducts, toUpdateProducts, toCreateVariants, toUpdateVariants, rowErrors, rowWarnings },
    groups,
  };
}

/** The unique index compares SKUs case-insensitively, so every in-memory comparison does too (S22 BUG-11). */
const skuKey = (sku: string) => sku.toUpperCase();

type CheckResult = { ok: true; report: ImportReport; token: string } | { ok: false; error: string };

export async function checkProductImport(buffer: Buffer): Promise<CheckResult> {
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) return { ok: false, error: "The file is larger than 2 MB." };
  const result = await runChecks(buffer.toString("utf8"));
  if ("fileError" in result) return { ok: false, error: result.fileError };

  const token = encodeImportCheckToken(hashFile(buffer), new Date(Date.now() + IMPORT_CHECK_TOKEN_TTL_MS), env.SESSION_SECRET);
  return { ok: true, report: result.report, token };
}

type CommitResult = { ok: true; created: number; updated: number } | { ok: false; error: string; report?: ImportReport };

/** The uploaded file's name is kept for the audit row's `new_values` only, capped here (S22 BUG-03). */
export const MAX_IMPORT_FILE_NAME_LENGTH = 200;

export async function commitProductImport(buffer: Buffer, token: string, actor: { id: number }, fileName: string): Promise<CommitResult> {
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) return { ok: false, error: "The file is larger than 2 MB." };

  const expectedHash = decodeImportCheckToken(token, env.SESSION_SECRET, new Date());
  if (!expectedHash) return { ok: false, error: "This check has expired. Check the file again." };
  if (hashFile(buffer) !== expectedHash) return { ok: false, error: "The file changed since it was checked. Check it again." };

  const result = await runChecks(buffer.toString("utf8"));
  if ("fileError" in result) return { ok: false, error: result.fileError };
  if (result.report.rowErrors.length > 0) return { ok: false, error: "The file still has errors. Check it again.", report: result.report };

  let createdCount = 0;
  let updatedCount = 0;

  await db.transaction(async (tx) => {
    const now = new Date();
    // New products join the end of the shop (and featured) order instead of the default 0, which
    // would have put every import ahead of the catalogue (S22 BUG-10).
    const positions = await getMaxSortOrders(tx);

    for (const group of result.groups.values()) {
      const first = group.rows[0].value;
      const category = await getCategoryBySlugActive(first.categorySlug);
      if (!category) throw new Error(`Category "${first.categorySlug}" no longer exists.`);

      const existingProduct = await getProductBySlug(group.slug);
      let productId: number;
      let productBefore: ProductRow | null = null;

      if (existingProduct) {
        const locked = await lockProductById(tx, existingProduct.id);
        if (!locked) throw new Error(`Product "${group.slug}" no longer exists.`);
        productBefore = locked;
        productId = locked.id;
        await updateProduct(tx, productId, {
          name: first.name,
          categoryId: category.id,
          shortDescription: first.shortDescription,
          description: first.description,
          price: first.price,
          isFeatured: first.isFeatured,
          // Newly featured by this import: the end of the featured strip, not its front.
          ...(first.isFeatured && !locked.isFeatured ? { featuredSortOrder: ++positions.featured } : {}),
          status: first.status,
          updatedAt: now,
        });
        updatedCount++;
      } else {
        productId = await insertProduct(tx, {
          categoryId: category.id,
          name: first.name,
          slug: group.slug,
          shortDescription: first.shortDescription,
          description: first.description,
          price: first.price,
          weightGrams: null,
          isFeatured: first.isFeatured,
          status: first.status,
          sortOrder: ++positions.shop,
          featuredSortOrder: first.isFeatured ? ++positions.featured : 0,
          createdAt: now,
          updatedAt: now,
        });
        createdCount++;
      }

      const siblings = await lockVariantsByProductId(tx, productId);
      let nextSortOrder = siblings.length > 0 ? Math.max(...siblings.map((row) => row.sortOrder)) + 1 : 0;

      for (const entry of group.rows) {
        const existingVariant = siblings.find((row) => skuKey(row.sku) === skuKey(entry.value.sku));
        if (existingVariant) {
          await updateVariant(tx, existingVariant.id, {
            label: entry.value.label,
            attributes: JSON.stringify(entry.value.attributes),
            priceOverride: entry.value.priceOverride,
            stock: entry.value.stock,
            isActive: entry.value.isActive,
            updatedAt: now,
          });
        } else {
          await insertVariant(tx, {
            productId,
            sku: entry.value.sku,
            label: entry.value.label,
            attributes: JSON.stringify(entry.value.attributes),
            priceOverride: entry.value.priceOverride,
            stock: entry.value.stock,
            weightGrams: null,
            sortOrder: nextSortOrder,
            isActive: entry.value.isActive,
            createdAt: now,
            updatedAt: now,
          });
          nextSortOrder++;
        }
      }

      await insertAuditLog(tx, {
        userId: actor.id,
        action: "product.import",
        entity: "product",
        entityId: productId,
        oldValues: productBefore ? { name: productBefore.name, price: productBefore.price, status: productBefore.status } : null,
        newValues: { name: first.name, price: first.price, status: first.status, variantCount: group.rows.length },
        createdAt: now,
      });
    }

    // `entity_id` is VARCHAR(50) and the file name is the operator's own text (S22 BUG-03), so the
    // id is the checked file's hash prefix and the name only ever appears in `new_values`.
    await insertAuditLog(tx, {
      userId: actor.id,
      action: "product.bulk_import",
      entity: "product_import",
      entityId: `import:${expectedHash.slice(0, 16)}`,
      oldValues: null,
      newValues: { fileName: fileName.slice(0, MAX_IMPORT_FILE_NAME_LENGTH), products: result.groups.size, created: createdCount, updated: updatedCount, rows: result.report.totalRows },
      createdAt: now,
    });
  });

  return { ok: true, created: createdCount, updated: updatedCount };
}
