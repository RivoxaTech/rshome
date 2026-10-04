/**
 * The panel's variant CRUD (S10, REQUIREMENTS DV-02, ARCHITECTURE.md D53). Every write
 * runs in one transaction that locks the product row and then the product's whole variant set
 * (`SELECT … FOR UPDATE`, in that order — the same order the product form takes), re-checks the
 * rules under that lock, and writes `audit_logs` rows (CLAUDE.md #10). Refusals come back as
 * `{ ok: false }` with a message staff can act on, never thrown.
 *
 * The rules: a SKU is unique across every product; two variants of one product can't share an
 * attribute set; a variant that appears in any `order_items` row can only be deactivated, never
 * deleted; a product always keeps at least one variant; the last *active* variant of an Active
 * product can't be deactivated or deleted (archive the product instead).
 */
import { insertAuditLog } from "@/features/audit/repo";
import { db, type DbClient } from "@/server/db/client";
import { moveId, renormalize, type Placement } from "./ordering";
import { lockProductById, type ProductRow } from "./products-staff-repo";
import { variantInputSchema, type VariantInput } from "./schemas";
import type { StaffActionResult } from "./staff-service";
import { parseVariantAttributes, sameAttributes } from "./variants";
import { isDuplicateEntry } from "@/server/db/errors";
import {
  countOrderItemsByVariantIds,
  deleteVariant,
  getVariantProductId,
  getVariantsByProductId,
  insertVariant,
  lockVariantsByProductId,
  skuInUse,
  updateVariant,
  updateVariantSortOrders,
  type ProductVariantRow,
} from "./variants-staff-repo";
import { StaffActionError, invalidInput } from "@/features/shared/staff-result";

export type { StaffActionResult };

type Actor = { id: number };

function refused(error: unknown): StaffActionResult {
  if (error instanceof StaffActionError) return { ok: false, error: error.message, fieldErrors: error.field ? { [error.field]: error.message } : undefined };
  if (isDuplicateEntry(error)) return { ok: false, error: "That SKU is already in use. Choose another.", fieldErrors: { sku: "That SKU is already in use. Choose another." } };
  throw error;
}

const ORDERED_VARIANT_MESSAGE = "This variant appears on past orders, so it can't be deleted. Deactivate it instead to take it off the storefront.";
const LAST_VARIANT_MESSAGE = "A product always keeps at least one variant, so the last one can't be deleted.";
const LAST_ACTIVE_VARIANT_MESSAGE = "This is the only active variant of an active product. Archive the product instead if it shouldn't be sold.";

// ── The read model ──────────────────────────────────────────────────────────────────────────

export type PanelVariant = {
  id: number;
  label: string;
  attributes: Record<string, string>;
  sku: string;
  /** DECIMAL string, or null when the variant sells at the product price. */
  priceOverride: string | null;
  stock: number;
  weightGrams: number | null;
  isActive: boolean;
  /** 1-based display position. */
  position: number;
  /** True when any `order_items` row references it: Delete is refused, Deactivate offered instead. */
  ordered: boolean;
};

export async function getPanelVariants(productId: number): Promise<PanelVariant[]> {
  const rows = await getVariantsByProductId(db, productId);
  const orderCounts = await countOrderItemsByVariantIds(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row, index) => ({
    id: row.id,
    label: row.label,
    attributes: parseVariantAttributes(row.attributes),
    sku: row.sku,
    priceOverride: row.priceOverride,
    stock: row.stock,
    weightGrams: row.weightGrams,
    isActive: row.isActive,
    position: index + 1,
    ordered: (orderCounts.get(row.id) ?? 0) > 0,
  }));
}

// ── Shared checks (all under the lock) ──────────────────────────────────────────────────────

async function assertSkuAvailable(sku: string, excludeId?: number): Promise<void> {
  if (await skuInUse(sku, excludeId)) throw new StaffActionError("That SKU is already in use. Choose another.", "sku");
}

function assertAttributesUnique(attributes: Record<string, string>, siblings: ProductVariantRow[], excludeId?: number): void {
  const clash = siblings.find((row) => row.id !== excludeId && sameAttributes(parseVariantAttributes(row.attributes), attributes));
  if (clash) throw new StaffActionError(`"${clash.label}" already has exactly these attributes. Change one value or edit that variant instead.`, "attributeKey0");
}

/** The last active variant of an Active product can't go inactive (or away): the product would have nothing to sell. */
function assertNotLastActive(product: ProductRow, variants: ProductVariantRow[], variantId: number): void {
  if (product.status !== "active") return;
  const otherActive = variants.some((row) => row.id !== variantId && row.isActive);
  if (!otherActive) throw new StaffActionError(LAST_ACTIVE_VARIANT_MESSAGE);
}

/** Locks the product, then its variants, and resolves the one being acted on — refusing a stale id instead of silently doing nothing. */
async function lockVariantContext(tx: DbClient, productId: number, variantId: number): Promise<{ product: ProductRow; variants: ProductVariantRow[]; variant: ProductVariantRow }> {
  const product = await lockProductById(tx, productId);
  if (!product) throw new StaffActionError("Product not found.");
  const variants = await lockVariantsByProductId(tx, productId);
  const variant = variants.find((row) => row.id === variantId);
  if (!variant) throw new StaffActionError("That variant no longer exists. Reload and try again.");
  return { product, variants, variant };
}

function variantAuditValues(variant: Pick<ProductVariantRow, "label" | "sku" | "attributes" | "priceOverride" | "stock" | "weightGrams" | "isActive">) {
  return {
    label: variant.label,
    sku: variant.sku,
    attributes: parseVariantAttributes(variant.attributes),
    priceOverride: variant.priceOverride,
    stock: variant.stock,
    weightGrams: variant.weightGrams,
    isActive: variant.isActive,
  };
}

type AuditEntry = Parameters<typeof insertAuditLog>[1];

function variantAudit(actor: Actor, variantId: number, action: string, oldValues: object | null, newValues: object, now: Date): AuditEntry {
  return { userId: actor.id, action, entity: "product_variant", entityId: variantId, oldValues, newValues, createdAt: now };
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────

export async function createVariant(productId: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = variantInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input: VariantInput = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      const product = await lockProductById(tx, productId);
      if (!product) throw new StaffActionError("Product not found.");
      const siblings = await lockVariantsByProductId(tx, productId);
      await assertSkuAvailable(input.sku);
      assertAttributesUnique(input.attributes, siblings);

      const now = new Date();
      const id = await insertVariant(tx, {
        productId,
        sku: input.sku,
        label: input.label,
        attributes: JSON.stringify(input.attributes),
        priceOverride: input.priceOverride,
        stock: input.stock,
        weightGrams: input.weightGrams,
        // Appended after the current last position (positions are renormalized on every reorder).
        sortOrder: siblings.length === 0 ? 0 : Math.max(...siblings.map((row) => row.sortOrder)) + 1,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      });
      await insertAuditLog(tx, variantAudit(actor, id, "variant.create", null, { productId, ...variantAuditValues({ ...input, attributes: JSON.stringify(input.attributes) }) }, now));
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    return refused(error);
  }
}

// ── Update (the dialog) ─────────────────────────────────────────────────────────────────────

export async function updateVariantById(variantId: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = variantInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input: VariantInput = parsed.data;

  try {
    const productId = await getVariantProductId(variantId);
    if (productId === undefined) throw new StaffActionError("That variant no longer exists. Reload and try again.");

    await db.transaction(async (tx) => {
      const { product, variants, variant } = await lockVariantContext(tx, productId, variantId);
      await assertSkuAvailable(input.sku, variantId);
      assertAttributesUnique(input.attributes, variants, variantId);
      if (variant.isActive && !input.isActive) assertNotLastActive(product, variants, variantId);

      const now = new Date();
      await updateVariant(tx, variantId, {
        sku: input.sku,
        label: input.label,
        attributes: JSON.stringify(input.attributes),
        priceOverride: input.priceOverride,
        stock: input.stock,
        weightGrams: input.weightGrams,
        isActive: input.isActive,
        updatedAt: now,
      });

      const before = variantAuditValues(variant);
      const after = variantAuditValues({ ...input, attributes: JSON.stringify(input.attributes) });
      await insertAuditLog(tx, variantAudit(actor, variantId, "variant.update", before, after, now));
      if (variant.stock !== input.stock) {
        await insertAuditLog(tx, variantAudit(actor, variantId, "variant.stock_change", { stock: variant.stock }, { stock: input.stock }, now));
      }
      if (variant.priceOverride !== input.priceOverride) {
        await insertAuditLog(tx, variantAudit(actor, variantId, "variant.price_override_change", { priceOverride: variant.priceOverride }, { priceOverride: input.priceOverride }, now));
      }
      if (variant.isActive !== input.isActive) {
        await insertAuditLog(tx, variantAudit(actor, variantId, input.isActive ? "variant.activate" : "variant.deactivate", { isActive: variant.isActive }, { isActive: input.isActive }, now));
      }
    });
    return { ok: true, id: variantId };
  } catch (error) {
    return refused(error);
  }
}

// ── Quick actions: stock, active ────────────────────────────────────────────────────────────

export async function setVariantStock(variantId: number, stock: number, actor: Actor): Promise<StaffActionResult> {
  try {
    const productId = await getVariantProductId(variantId);
    if (productId === undefined) throw new StaffActionError("That variant no longer exists. Reload and try again.");

    await db.transaction(async (tx) => {
      const { variant } = await lockVariantContext(tx, productId, variantId);
      if (variant.stock === stock) return;
      const now = new Date();
      await updateVariant(tx, variantId, { stock, updatedAt: now });
      await insertAuditLog(tx, variantAudit(actor, variantId, "variant.stock_change", { stock: variant.stock }, { stock }, now));
    });
    return { ok: true, id: variantId };
  } catch (error) {
    return refused(error);
  }
}

export async function setVariantActive(variantId: number, isActive: boolean, actor: Actor): Promise<StaffActionResult> {
  try {
    const productId = await getVariantProductId(variantId);
    if (productId === undefined) throw new StaffActionError("That variant no longer exists. Reload and try again.");

    await db.transaction(async (tx) => {
      const { product, variants, variant } = await lockVariantContext(tx, productId, variantId);
      if (variant.isActive === isActive) throw new StaffActionError(`This variant is already ${isActive ? "active" : "inactive"}.`);
      if (!isActive) assertNotLastActive(product, variants, variantId);

      const now = new Date();
      await updateVariant(tx, variantId, { isActive, updatedAt: now });
      await insertAuditLog(tx, variantAudit(actor, variantId, isActive ? "variant.activate" : "variant.deactivate", { isActive: variant.isActive }, { isActive }, now));
    });
    return { ok: true, id: variantId };
  } catch (error) {
    return refused(error);
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────

export async function deleteVariantById(variantId: number, actor: Actor): Promise<StaffActionResult> {
  try {
    const productId = await getVariantProductId(variantId);
    if (productId === undefined) throw new StaffActionError("That variant no longer exists. Reload and try again.");

    await db.transaction(async (tx) => {
      const { product, variants, variant } = await lockVariantContext(tx, productId, variantId);
      const orderCounts = await countOrderItemsByVariantIds(tx, [variantId]);
      if ((orderCounts.get(variantId) ?? 0) > 0) throw new StaffActionError(ORDERED_VARIANT_MESSAGE);
      if (variants.length === 1) throw new StaffActionError(LAST_VARIANT_MESSAGE);
      if (variant.isActive) assertNotLastActive(product, variants, variantId);

      const now = new Date();
      await deleteVariant(tx, variantId);
      // Keep the remaining positions dense (1..n), so "position" means the same thing after a delete.
      const remaining = variants.filter((row) => row.id !== variantId).map((row) => row.id);
      await updateVariantSortOrders(tx, [...renormalize(remaining).entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
      await insertAuditLog(tx, variantAudit(actor, variantId, "variant.delete", { productId, ...variantAuditValues(variant) }, {}, now));
    });
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

// ── Reorder (drag-drop save and per-row move) ───────────────────────────────────────────────

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id)) && new Set(b).size === set.size;
}

async function writeVariantOrder(tx: DbClient, productId: number, before: number[], after: number[], actor: Actor): Promise<void> {
  const now = new Date();
  await updateVariantSortOrders(tx, [...renormalize(after).entries()].map(([id, sortOrder]) => ({ id, sortOrder })));
  await insertAuditLog(tx, {
    userId: actor.id,
    action: "variant.sort_change",
    entity: "product_variant_order",
    entityId: productId,
    oldValues: { order: before },
    newValues: { order: after },
    createdAt: now,
  });
}

/** The whole drag-drop result: `orderedIds` must be exactly the product's current variant ids, just reordered (checked against a fresh locked read). */
export async function saveVariantOrder(input: { productId: number; orderedIds: number[] }, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const product = await lockProductById(tx, input.productId);
      if (!product) throw new StaffActionError("Product not found.");
      const existing = (await lockVariantsByProductId(tx, input.productId)).map((row) => row.id);
      if (!sameIdSet(existing, input.orderedIds)) throw new StaffActionError("This list changed elsewhere. Reload and try again.");
      await writeVariantOrder(tx, input.productId, existing, input.orderedIds, actor);
    });
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** A per-row "Move to top/end/position N" within the variant's own product. */
export async function moveVariant(input: { variantId: number; placement: Placement }, actor: Actor): Promise<StaffActionResult> {
  try {
    const productId = await getVariantProductId(input.variantId);
    if (productId === undefined) throw new StaffActionError("That variant no longer exists. Reload and try again.");

    await db.transaction(async (tx) => {
      const { variants } = await lockVariantContext(tx, productId, input.variantId);
      const existing = variants.map((row) => row.id);
      await writeVariantOrder(tx, productId, existing, moveId(existing, input.variantId, input.placement), actor);
    });
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
