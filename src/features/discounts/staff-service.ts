/**
 * The panel's discounts CRUD (S12, REQUIREMENTS DV-04 / §7.1, `discount.manage`). Every write
 * locks the row it touches (`SELECT … FOR UPDATE`, one transaction) and records an `audit_logs`
 * row with old/new values (CLAUDE.md #10), mirroring `features/catalog/staff-service.ts`. The
 * "active now" status and the overlap hint both come from `features/pricing/pricing.ts`'s own
 * `isDiscountActive`/`discountMatchesProduct` — no second implementation of either rule.
 */
import type { ZodError } from "zod";
import { insertAuditLog } from "@/features/audit/repo";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { decimalToPaisa } from "@/features/pricing/money";
import { discountMatchesProduct, isDiscountActive, type PricingDiscount } from "@/features/pricing/pricing";
import { db } from "@/server/db/client";
import { formatKarachiDateTime } from "@/lib/karachi-datetime";
import { checkDateWindow, dateWindowFieldErrors, type DateWindow } from "./dates";
import { discountInputSchema, discountOverlapQuerySchema, type DiscountInput, type DiscountTab, type DiscountTargetType, type DiscountType } from "./schemas";
import {
  deleteDiscount,
  getCategoryNamesByIds,
  getDiscountWithTargets,
  getProductNamesByIds,
  insertDiscount,
  listAllDiscountsWithTargets,
  listCategoryOptions,
  listProductOptions,
  listProductsForOverlap,
  lockDiscountById,
  replaceDiscountTargets,
  updateDiscount,
  type CategoryOption,
  type DiscountRow,
  type DiscountWithTargets,
  type ProductOption,
} from "./staff-repo";
import { discountStatus, discountValueText, targetSummary, type DiscountStatus } from "./status";

export type { StaffActionResult };

type Actor = { id: number };

/**
 * `allowPastDates` skips the no-past-dates rule (`dates.ts`) — for `scripts/seed-demo-promotions.ts`
 * and tests that need an expired or already-started fixture; the Server Actions never pass it.
 * `now` is injectable so tests are deterministic.
 */
export type WriteOptions = { allowPastDates?: boolean; now?: Date };

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
class DiscountActionError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function invalid(error: ZodError): StaffActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

function refused(error: DiscountActionError): StaffActionResult {
  return error.field ? { ok: false, error: error.message, fieldErrors: { [error.field]: error.message } } : { ok: false, error: error.message };
}

/** The no-past-dates rule as a refusal; `previous` is the locked row on edit, null on create. */
export function dateWindowRefusal(input: DateWindow, previous: DateWindow | null, options: WriteOptions): StaffActionResult | null {
  const errors = checkDateWindow(input, { previous, now: options.now ?? new Date(), allowPastDates: options.allowPastDates });
  if (errors.length === 0) return null;
  return { ok: false, error: errors[0].message, fieldErrors: dateWindowFieldErrors(errors) };
}

/** The pricing module's shape for a stored row, so its rules can run on panel data unchanged. */
function toPricingDiscount({ discount, targetIds }: DiscountWithTargets): PricingDiscount {
  return {
    id: discount.id,
    type: discount.type,
    value: decimalToPaisa(discount.value),
    targetType: discount.targetType,
    targetIds,
    isActive: discount.isActive,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
  };
}

// ── The list ────────────────────────────────────────────────────────────────────────────────────

export type StaffDiscountListItem = {
  serial: number;
  id: number;
  name: string;
  type: DiscountType;
  value: string;
  valueText: string;
  targetType: DiscountTargetType;
  targetText: string;
  /** Karachi-formatted, or null when the bound is open. */
  startsAt: string | null;
  endsAt: string | null;
  status: DiscountStatus;
  isActive: boolean;
};

export type DiscountTabCounts = Record<DiscountTab, number>;

export async function listStaffDiscounts(query: {
  tab: DiscountTab;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: StaffDiscountListItem[]; counts: DiscountTabCounts; total: number; page: number; pageSize: number; pageCount: number }> {
  const all = await listAllDiscountsWithTargets(query.q);
  const now = new Date();
  const withStatus = all.map((entry) => ({ ...entry, status: discountStatus(toPricingDiscount(entry), now) }));

  const counts: DiscountTabCounts = { all: withStatus.length, active: 0, scheduled: 0, expired: 0, inactive: 0 };
  for (const entry of withStatus) counts[entry.status] += 1;

  const filtered = query.tab === "all" ? withStatus : withStatus.filter((entry) => entry.status === query.tab);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const offset = (query.page - 1) * query.pageSize;
  const pageRows = filtered.slice(offset, offset + query.pageSize);

  const categoryIds = pageRows.filter((entry) => entry.discount.targetType === "category").flatMap((entry) => entry.targetIds);
  const categoryNames = await getCategoryNamesByIds(categoryIds);

  const items = pageRows.map((entry, index) => ({
    serial: offset + index + 1,
    id: entry.discount.id,
    name: entry.discount.name,
    type: entry.discount.type,
    value: entry.discount.value,
    valueText: discountValueText(entry.discount.type, entry.discount.value),
    targetType: entry.discount.targetType,
    targetText: targetSummary(entry.discount.targetType, entry.targetIds.length, categoryNames.get(entry.targetIds[0] ?? -1) ?? null),
    startsAt: entry.discount.startsAt ? formatKarachiDateTime(entry.discount.startsAt) : null,
    endsAt: entry.discount.endsAt ? formatKarachiDateTime(entry.discount.endsAt) : null,
    status: entry.status,
    isActive: entry.discount.isActive,
  }));

  return { items, counts, total, page: query.page, pageSize: query.pageSize, pageCount };
}

// ── The create/edit form ────────────────────────────────────────────────────────────────────────

type DiscountFormOptions = { categories: CategoryOption[]; products: ProductOption[] };

export async function getDiscountFormOptions(): Promise<DiscountFormOptions> {
  const [categories, products] = await Promise.all([listCategoryOptions(), listProductOptions()]);
  return { categories, products };
}

type DiscountEditFormData = { discount: DiscountRow; targetIds: number[]; status: DiscountStatus };

export async function getDiscountForEdit(id: number): Promise<DiscountEditFormData | null> {
  const entry = await getDiscountWithTargets(id);
  if (!entry) return null;
  return { discount: entry.discount, targetIds: entry.targetIds, status: discountStatus(toPricingDiscount(entry), new Date()) };
}

// ── Shared validation ───────────────────────────────────────────────────────────────────────────

/** Every target id must be a real category/product — a stale picker or a forged post is refused. */
async function assertTargetsExist(input: DiscountInput): Promise<void> {
  if (input.targetType === "category") {
    const names = await getCategoryNamesByIds(input.targetIds);
    if (names.size !== input.targetIds.length) throw new DiscountActionError("Choose a valid category.", "categoryId");
  }
  if (input.targetType === "product") {
    const names = await getProductNamesByIds(input.targetIds);
    if (names.size !== input.targetIds.length) throw new DiscountActionError("One of the chosen products no longer exists. Remove it and try again.", "productIds");
  }
}

type DiscountAuditFields = Pick<DiscountRow, "name" | "type" | "value" | "targetType" | "startsAt" | "endsAt" | "isActive">;

function auditValues(discount: DiscountAuditFields, targetIds: number[]) {
  return {
    name: discount.name,
    type: discount.type,
    value: discount.value,
    targetType: discount.targetType,
    targetIds,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
    isActive: discount.isActive,
  };
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────────

export async function createDiscount(rawInput: unknown, actor: Actor, options: WriteOptions = {}): Promise<StaffActionResult> {
  const parsed = discountInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const dateRefusal = dateWindowRefusal(input, null, options);
  if (dateRefusal) return dateRefusal;

  try {
    const id = await db.transaction(async (tx) => {
      await assertTargetsExist(input);
      const now = new Date();
      const id = await insertDiscount(tx, {
        name: input.name,
        type: input.type,
        value: input.value,
        targetType: input.targetType,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      });
      await replaceDiscountTargets(tx, id, input.targetIds);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "discount.create",
        entity: "discount",
        entityId: id,
        oldValues: null,
        newValues: auditValues(input, input.targetIds),
        createdAt: now,
      });
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof DiscountActionError) return refused(error);
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────────

export async function updateDiscountById(id: number, rawInput: unknown, actor: Actor, options: WriteOptions = {}): Promise<StaffActionResult> {
  const parsed = discountInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const current = await lockDiscountById(tx, id);
      if (!current) throw new DiscountActionError("Discount not found.");
      // Only a bound the Developer changed (vs the locked row) is checked, so a live discount's past start never blocks a save.
      const dateRefusal = dateWindowRefusal(input, current.discount, options);
      if (dateRefusal && !dateRefusal.ok) throw new DiscountActionError(dateRefusal.error, Object.keys(dateRefusal.fieldErrors ?? {})[0]);
      await assertTargetsExist(input);

      const now = new Date();
      await updateDiscount(tx, id, {
        name: input.name,
        type: input.type,
        value: input.value,
        targetType: input.targetType,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isActive: input.isActive,
        updatedAt: now,
      });
      await replaceDiscountTargets(tx, id, input.targetIds);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "discount.update",
        entity: "discount",
        entityId: id,
        oldValues: auditValues(current.discount, current.targetIds),
        newValues: auditValues(input, input.targetIds),
        createdAt: now,
      });
      if (input.isActive !== current.discount.isActive) {
        await insertAuditLog(tx, {
          userId: actor.id,
          action: input.isActive ? "discount.activate" : "discount.deactivate",
          entity: "discount",
          entityId: id,
          oldValues: { isActive: current.discount.isActive },
          newValues: { isActive: input.isActive },
          createdAt: now,
        });
      }
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof DiscountActionError) return refused(error);
    throw error;
  }
}

// ── Activate / deactivate ───────────────────────────────────────────────────────────────────────

export async function setDiscountActive(id: number, isActive: boolean, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const current = await lockDiscountById(tx, id);
      if (!current) throw new DiscountActionError("Discount not found.");
      if (current.discount.isActive === isActive) throw new DiscountActionError(`This discount is already ${isActive ? "active" : "inactive"}.`);

      const now = new Date();
      await updateDiscount(tx, id, { isActive, updatedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: isActive ? "discount.activate" : "discount.deactivate",
        entity: "discount",
        entityId: id,
        oldValues: { isActive: current.discount.isActive },
        newValues: { isActive },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof DiscountActionError) return refused(error);
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Always allowed: `order_items` snapshot their unit price and discount amount at purchase, so no
 * past order points at a discount row (DATABASE.md rule 4) — unlike a product or a coupon.
 */
export async function deleteDiscountById(id: number, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const current = await lockDiscountById(tx, id);
      if (!current) throw new DiscountActionError("Discount not found.");

      const now = new Date();
      await deleteDiscount(tx, id);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "discount.delete",
        entity: "discount",
        entityId: id,
        oldValues: auditValues(current.discount, current.targetIds),
        newValues: {},
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof DiscountActionError) return refused(error);
    throw error;
  }
}

// ── The overlap hint ────────────────────────────────────────────────────────────────────────────

type DiscountOverlap = { id: number; name: string; productCount: number };
export type DiscountOverlapResult = { ok: true; matchedProducts: number; overlaps: DiscountOverlap[] } | { ok: false; error: string };

/**
 * Which other currently-active discounts share at least one product with the targets being
 * edited, computed with the pricing module's own `discountMatchesProduct`/`isDiscountActive`
 * (the lowest final price wins per variant; discounts never stack — §4.1).
 */
export async function findOverlappingDiscounts(rawQuery: unknown): Promise<DiscountOverlapResult> {
  const parsed = discountOverlapQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const query = parsed.data;

  const targetIds = query.targetType === "category" ? (query.categoryId ? [query.categoryId] : []) : query.targetType === "product" ? query.productIds : [];
  if (query.targetType !== "all" && targetIds.length === 0) return { ok: true, matchedProducts: 0, overlaps: [] };

  // The value/type don't affect which products a discount *matches*, only what it does to them.
  const candidate: PricingDiscount = { id: 0, type: "percent", value: 0, targetType: query.targetType, targetIds, isActive: true, startsAt: null, endsAt: null };
  const now = new Date();
  const [productRows, all] = await Promise.all([listProductsForOverlap(), listAllDiscountsWithTargets()]);
  const products = productRows.map((row) => ({ id: row.id, price: decimalToPaisa(row.price), categoryId: row.categoryId, parentCategoryId: row.parentCategoryId }));
  const matched = products.filter((product) => discountMatchesProduct(candidate, product));
  if (matched.length === 0) return { ok: true, matchedProducts: 0, overlaps: [] };

  const overlaps: DiscountOverlap[] = [];
  for (const entry of all) {
    if (entry.discount.id === query.excludeId) continue;
    const other = toPricingDiscount(entry);
    if (!isDiscountActive(other, now)) continue;
    const shared = matched.filter((product) => discountMatchesProduct(other, product)).length;
    if (shared > 0) overlaps.push({ id: entry.discount.id, name: entry.discount.name, productCount: shared });
  }
  return { ok: true, matchedProducts: matched.length, overlaps };
}
