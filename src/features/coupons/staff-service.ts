/**
 * The panel's coupons CRUD (S13, REQUIREMENTS DV-05 / §7.2, `coupon.manage`). Every write locks
 * the row (`SELECT … FOR UPDATE`, one transaction) and records an `audit_logs` row with old/new
 * values (CLAUDE.md #10), mirroring `features/discounts/staff-service.ts`. Usage is always the
 * live `coupon_usages` count; the status pill is the pricing module's own `resolveCoupon` verdict.
 */
import { insertAuditLog } from "@/features/audit/repo";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { dateWindowRefusal, type WriteOptions } from "@/features/discounts/staff-service";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import type { PricingCoupon } from "@/features/pricing/pricing";
import { db } from "@/server/db/client";
import { formatKarachiDateTime } from "@/lib/karachi-datetime";
import { couponInputSchema, type CouponInput, type CouponTab, type CouponType } from "./schemas";
import {
  codeInUse,
  countOrdersByCouponId,
  countUsagesByCouponId,
  countUsagesByCouponIds,
  deleteCoupon,
  getCouponById,
  insertCoupon,
  listAllCoupons,
  listRecentUsages,
  lockCouponById,
  updateCoupon,
  type CouponRow,
} from "./staff-repo";
import { couponStatus, couponValueText, usageText, type CouponStatus } from "./status";
import { isDuplicateEntry } from "@/server/db/errors";
import { pageCountOf } from "@/features/shared/pagination";
import { StaffActionError, invalidInput, refusal } from "@/features/shared/staff-result";

export type { StaffActionResult, WriteOptions };

type Actor = { id: number };

const CODE_IN_USE = "That code is already in use. Choose another.";
const RECENT_USAGES_SHOWN = 10;

/** The pricing module's shape for a stored row, with the live usage count in place of `used_count`. */
function toPricingCoupon(row: CouponRow, usageCount: number): PricingCoupon {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: decimalToPaisa(row.value),
    minOrder: row.minOrder === null ? null : decimalToPaisa(row.minOrder),
    maxDiscount: row.maxDiscount === null ? null : decimalToPaisa(row.maxDiscount),
    usageLimit: row.usageLimit,
    usedCount: usageCount,
    perCustomerLimit: row.perCustomerLimit,
    customerUsedCount: null,
    isActive: row.isActive,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

// ── The list ────────────────────────────────────────────────────────────────────────────────────

export type StaffCouponListItem = {
  serial: number;
  id: number;
  code: string;
  type: CouponType;
  valueText: string;
  /** Formatted, or null when there's no minimum. */
  minOrderText: string | null;
  usageText: string;
  /** Karachi-formatted, or null when the bound is open. */
  startsAt: string | null;
  endsAt: string | null;
  status: CouponStatus;
  isActive: boolean;
};

export type CouponTabCounts = Record<CouponTab, number>;

export async function listStaffCoupons(query: {
  tab: CouponTab;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: StaffCouponListItem[]; counts: CouponTabCounts; total: number; page: number; pageSize: number; pageCount: number }> {
  const rows = await listAllCoupons(query.q);
  const usages = await countUsagesByCouponIds(rows.map((row) => row.id));
  const now = new Date();
  const withStatus = rows.map((row) => {
    const usageCount = usages.get(row.id) ?? 0;
    return { row, usageCount, status: couponStatus(toPricingCoupon(row, usageCount), now) };
  });

  const counts: CouponTabCounts = { all: withStatus.length, active: 0, scheduled: 0, expired: 0, used_up: 0, inactive: 0 };
  for (const entry of withStatus) counts[entry.status] += 1;

  const filtered = query.tab === "all" ? withStatus : withStatus.filter((entry) => entry.status === query.tab);
  const total = filtered.length;
  const pageCount = pageCountOf(total, query.pageSize);
  const offset = (query.page - 1) * query.pageSize;

  const items = filtered.slice(offset, offset + query.pageSize).map((entry, index) => ({
    serial: offset + index + 1,
    id: entry.row.id,
    code: entry.row.code,
    type: entry.row.type,
    valueText: couponValueText(entry.row.type, entry.row.value, entry.row.maxDiscount),
    minOrderText: entry.row.minOrder ? formatMoney(decimalToPaisa(entry.row.minOrder)) : null,
    usageText: usageText(entry.usageCount, entry.row.usageLimit),
    startsAt: entry.row.startsAt ? formatKarachiDateTime(entry.row.startsAt) : null,
    endsAt: entry.row.endsAt ? formatKarachiDateTime(entry.row.endsAt) : null,
    status: entry.status,
    isActive: entry.row.isActive,
  }));

  return { items, counts, total, page: query.page, pageSize: query.pageSize, pageCount };
}

// ── The edit page ───────────────────────────────────────────────────────────────────────────────

export type CouponUsageSummary = {
  count: number;
  /** Karachi-formatted, or null when never used. */
  lastUsedAt: string | null;
  /** The most recent usages; `order` is filled only for a viewer who holds `order.view` (C24: the Developer sees dates and counts, never customer data or order links). */
  recent: { at: string; order: { orderNumber: string; paymentMethod: "cod" | "bank_transfer" } | null }[];
};

type CouponEditFormData = { coupon: CouponRow; status: CouponStatus; usage: CouponUsageSummary };

export async function getCouponForEdit(id: number, viewer: { canViewOrders: boolean }): Promise<CouponEditFormData | null> {
  const coupon = await getCouponById(id);
  if (!coupon) return null;
  const [count, recent] = await Promise.all([countUsagesByCouponId(id), listRecentUsages(id, RECENT_USAGES_SHOWN)]);
  return {
    coupon,
    status: couponStatus(toPricingCoupon(coupon, count), new Date()),
    usage: {
      count,
      lastUsedAt: recent[0] ? formatKarachiDateTime(recent[0].createdAt) : null,
      recent: recent.map((row) => ({
        at: formatKarachiDateTime(row.createdAt),
        order: viewer.canViewOrders ? { orderNumber: row.orderNumber, paymentMethod: row.paymentMethod } : null,
      })),
    },
  };
}

// ── Shared validation and audit ─────────────────────────────────────────────────────────────────

async function assertCodeAvailable(code: string, excludeId?: number): Promise<void> {
  if (await codeInUse(code, excludeId)) throw new StaffActionError(CODE_IN_USE, "code");
}

type CouponAuditFields = Pick<CouponRow, "code" | "type" | "value" | "minOrder" | "maxDiscount" | "usageLimit" | "perCustomerLimit" | "startsAt" | "endsAt" | "isActive">;

function auditValues(coupon: CouponAuditFields) {
  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrder: coupon.minOrder,
    maxDiscount: coupon.maxDiscount,
    usageLimit: coupon.usageLimit,
    perCustomerLimit: coupon.perCustomerLimit,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    isActive: coupon.isActive,
  };
}

function toRow(input: CouponInput) {
  return {
    code: input.code,
    type: input.type,
    value: input.value,
    minOrder: input.minOrder,
    maxDiscount: input.maxDiscount,
    usageLimit: input.usageLimit,
    perCustomerLimit: input.perCustomerLimit,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isActive: input.isActive,
  };
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────────

export async function createCoupon(rawInput: unknown, actor: Actor, options: WriteOptions = {}): Promise<StaffActionResult> {
  const parsed = couponInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;
  const dateRefusal = dateWindowRefusal(input, null, options);
  if (dateRefusal) return dateRefusal;

  try {
    const id = await db.transaction(async (tx) => {
      await assertCodeAvailable(input.code);
      const now = new Date();
      const id = await insertCoupon(tx, { ...toRow(input), usedCount: 0, createdAt: now, updatedAt: now });
      await insertAuditLog(tx, { userId: actor.id, action: "coupon.create", entity: "coupon", entityId: id, oldValues: null, newValues: auditValues(input), createdAt: now });
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    // The unique index is the backstop for two creates racing past `assertCodeAvailable`.
    if (isDuplicateEntry(error)) return { ok: false, error: CODE_IN_USE, fieldErrors: { code: CODE_IN_USE } };
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────────

export async function updateCouponById(id: number, rawInput: unknown, actor: Actor, options: WriteOptions = {}): Promise<StaffActionResult> {
  const parsed = couponInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const current = await lockCouponById(tx, id);
      if (!current) throw new StaffActionError("Coupon not found.");
      // Only a bound the Developer changed (vs the locked row) is checked, so a running coupon's past start never blocks a save.
      const dateRefusal = dateWindowRefusal(input, current, options);
      if (dateRefusal && !dateRefusal.ok) throw new StaffActionError(dateRefusal.error, Object.keys(dateRefusal.fieldErrors ?? {})[0]);
      await assertCodeAvailable(input.code, id);

      // Lowering the total limit below what's already been used would strand a coupon in "used up"
      // with no way back but raising it again — refused outright, with the live count in the message.
      const usageCount = await countUsagesByCouponId(id, tx);
      if (input.usageLimit !== null && input.usageLimit < usageCount) {
        throw new StaffActionError(`This coupon has already been used ${usageCount} ${usageCount === 1 ? "time" : "times"}; the limit can't go below that.`, "usageLimit");
      }

      // A type/value change on a used coupon is allowed: past orders keep their own snapshots
      // (`orders.coupon_discount`), so nothing already placed is recalculated. The form warns.
      const now = new Date();
      await updateCoupon(tx, id, { ...toRow(input), updatedAt: now });
      await insertAuditLog(tx, { userId: actor.id, action: "coupon.update", entity: "coupon", entityId: id, oldValues: auditValues(current), newValues: auditValues(input), createdAt: now });
      if (input.isActive !== current.isActive) {
        await insertAuditLog(tx, {
          userId: actor.id,
          action: input.isActive ? "coupon.activate" : "coupon.deactivate",
          entity: "coupon",
          entityId: id,
          oldValues: { isActive: current.isActive },
          newValues: { isActive: input.isActive },
          createdAt: now,
        });
      }
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    if (isDuplicateEntry(error)) return { ok: false, error: CODE_IN_USE, fieldErrors: { code: CODE_IN_USE } };
    throw error;
  }
}

// ── Activate / deactivate ───────────────────────────────────────────────────────────────────────

export async function setCouponActive(id: number, isActive: boolean, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const current = await lockCouponById(tx, id);
      if (!current) throw new StaffActionError("Coupon not found.");
      if (current.isActive === isActive) throw new StaffActionError(`This coupon is already ${isActive ? "active" : "inactive"}.`);

      const now = new Date();
      await updateCoupon(tx, id, { isActive, updatedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: isActive ? "coupon.activate" : "coupon.deactivate",
        entity: "coupon",
        entityId: id,
        oldValues: { isActive: current.isActive },
        newValues: { isActive },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────

export type CouponDeleteGuard = { allowed: true } | { allowed: false; usageCount: number; orderCount: number };

/** Refused once any order has used it (a usage row, or an order still referencing it after a cancel released the usage). */
export async function checkCouponDeletable(id: number): Promise<CouponDeleteGuard> {
  const [usageCount, orderCount] = await Promise.all([countUsagesByCouponId(id), countOrdersByCouponId(id)]);
  if (usageCount > 0 || orderCount > 0) return { allowed: false, usageCount, orderCount };
  return { allowed: true };
}

function usedMessage(usageCount: number, orderCount: number): string {
  const n = Math.max(usageCount, orderCount);
  return `This coupon has been used on ${n} ${n === 1 ? "order" : "orders"}, so it can't be deleted. Deactivate it instead.`;
}

export async function deleteCouponById(id: number, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const current = await lockCouponById(tx, id);
      if (!current) throw new StaffActionError("Coupon not found.");

      const [usageCount, orderCount] = await Promise.all([countUsagesByCouponId(id, tx), countOrdersByCouponId(id, tx)]);
      if (usageCount > 0 || orderCount > 0) throw new StaffActionError(usedMessage(usageCount, orderCount));

      const now = new Date();
      await deleteCoupon(tx, id);
      await insertAuditLog(tx, { userId: actor.id, action: "coupon.delete", entity: "coupon", entityId: id, oldValues: auditValues(current), newValues: {}, createdAt: now });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return refusal(error);
    throw error;
  }
}
