/**
 * What staff do to an order from the panel (ARCHITECTURE.md §4.3, owner decision C20). The
 * Server Actions check the permission; every function here validates its input, locks the order
 * row, re-checks the move under that lock, and records it in `order_status_history` (and
 * `audit_logs` for approvals, which set the delivery charge, and screenshot reviews) in the same
 * transaction.
 */
import type { z } from "zod";
import { features } from "@/config/features";
import { insertAuditLog } from "@/features/audit/repo";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { insertStatusHistory } from "@/features/checkout/repo";
import { getProofSummaries } from "@/features/payments/repo";
import { decimalToPaisa, formatMoney, paisaToDecimal } from "@/features/pricing/money";
import { totalWithDeliveryCharge } from "@/features/pricing/pricing";
import { db, type DbClient } from "@/server/db/client";
import { approveOrderSchema, closeOrderSchema, fulfilmentSchema, orderNoteSchema, reviewProofSchema } from "./schemas";
import { paymentProgress, type OrderStatus, type PaymentStatus } from "./status";
import {
  getLatestProof,
  getProof,
  getProofOrderNumber,
  lockOrderByNumber,
  releaseCouponUsage,
  restoreStockOnce,
  updateOrder,
  updateProof,
  type OrderUpdate,
} from "./staff-repo";
import {
  PROOF_PURPOSE_LABELS,
  approvalRefusal,
  approvedStatus,
  canMovePayment,
  canReviewProofs,
  closeRefusal,
  closedStatus,
  planFulfilment,
  recomputePaymentStatus,
  statusAfterPaymentReview,
} from "./transitions";

export type StaffActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** The signed-in staff member, from `requirePermission`. */
type Actor = { id: number };
type LockedOrder = NonNullable<Awaited<ReturnType<typeof lockOrderByNumber>>>;

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
class StaffActionError extends Error {}

function invalid(error: z.ZodError): StaffActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

async function withLockedOrder(
  orderNumber: string,
  change: (tx: DbClient, order: LockedOrder, now: Date) => Promise<void>,
): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const order = await lockOrderByNumber(tx, orderNumber);
      if (!order) throw new StaffActionError("Order not found.");
      await change(tx, order, new Date());
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof StaffActionError) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * Writes a new order-level payment status with its history row. A move the state machine doesn't
 * allow is a bug, so it throws and nothing is saved. Returns false when the status is unchanged.
 */
async function writePaymentStatus(tx: DbClient, order: LockedOrder, next: PaymentStatus, note: string, actor: Actor, now: Date) {
  if (next === order.paymentStatus) return false;
  if (!canMovePayment(order.paymentStatus, next)) throw new Error(`Payment status can't move from ${order.paymentStatus} to ${next}.`);
  await updateOrder(tx, order.id, { paymentStatus: next });
  await insertStatusHistory(tx, [
    { orderId: order.id, kind: "payment", fromStatus: order.paymentStatus, toStatus: next, note, changedBy: actor.id, createdAt: now },
  ]);
  return true;
}

async function writeOrderStatus(tx: DbClient, order: LockedOrder, next: OrderStatus, note: string | null, actor: Actor, now: Date) {
  await insertStatusHistory(tx, [
    { orderId: order.id, kind: "order", fromStatus: order.orderStatus, toStatus: next, note, changedBy: actor.id, createdAt: now },
  ]);
}

/**
 * "Approve order" (C20): one step that sets the quoted delivery charge (C13), grows the total by
 * it, approves the products screenshot of a bank order, and moves the order on: to "Delivery
 * charge unpaid" when a bank customer must still transfer a charge above zero, else straight to
 * "Good to go". The payment summary is recomputed from the proofs (C19).
 */
export async function approveOrder(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = approveOrderSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  return withLockedOrder(input.orderNumber, async (tx, order, now) => {
    const progress = paymentProgress({ ...order, proofs: await getProofSummaries(order.id, tx) }, features.deliveryChargeByTransfer);
    const refusal = approvalRefusal(order, progress.goods);
    if (refusal) throw new StaffActionError(refusal);

    if (order.paymentMethod === "bank_transfer" && progress.goods === "submitted") {
      const proof = (await getLatestProof(tx, order.id, "goods"))!;
      await updateProof(tx, proof.id, { status: "verified", rejectionReason: null, reviewedBy: actor.id, reviewedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "payment.approve",
        entity: "payment_proof",
        entityId: proof.id,
        oldValues: { status: proof.status },
        newValues: { status: "verified", purpose: proof.purpose, orderNumber: order.orderNumber },
        createdAt: now,
      });
    }

    const charge = decimalToPaisa(input.amount);
    const shippingTotal = paisaToDecimal(charge);
    const amounts = {
      subtotal: decimalToPaisa(order.subtotal),
      discountTotal: decimalToPaisa(order.discountTotal),
      couponDiscount: decimalToPaisa(order.couponDiscount),
    };
    const total = paisaToDecimal(totalWithDeliveryCharge(amounts, charge));
    const orderStatus = approvedStatus(order.paymentMethod, charge, features.deliveryChargeByTransfer);
    // PKR only (C12): the display total is the total.
    await updateOrder(tx, order.id, { shippingTotal, shippingNote: input.note, total, displayTotal: total, orderStatus });
    const approvedNote = `Approved. Delivery charge ${formatMoney(charge)}${input.note ? ` (${input.note})` : ""}`;
    await writeOrderStatus(tx, order, orderStatus, approvedNote, actor, now);

    const proofs = await getProofSummaries(order.id, tx);
    const paymentStatus = recomputePaymentStatus({ ...order, shippingTotal, proofs }, features.deliveryChargeByTransfer);
    await writePaymentStatus(tx, order, paymentStatus, "Products payment screenshot approved", actor, now);

    await insertAuditLog(tx, {
      userId: actor.id,
      action: "order.approve",
      entity: "order",
      entityId: order.orderNumber,
      oldValues: { orderStatus: order.orderStatus, shippingTotal: order.shippingTotal, total: order.total, paymentStatus: order.paymentStatus },
      newValues: { orderStatus, shippingTotal, shippingNote: input.note, total, paymentStatus },
      createdAt: now,
    });
  });
}

/**
 * Reject a screenshot (products or delivery charge) with a reason the customer sees, who can then
 * upload again; or approve a delivery charge screenshot, which makes the order good to go once
 * every payment is in. The products screenshot is approved by "Approve order" instead.
 */
export async function reviewProof(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = reviewProofSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const orderNumber = await getProofOrderNumber(input.proofId);
  if (!orderNumber) return { ok: false, error: "Screenshot not found." };

  return withLockedOrder(orderNumber, async (tx, order, now) => {
    const proof = await getProof(tx, input.proofId);
    if (!proof || proof.orderId !== order.id) throw new StaffActionError("Screenshot not found.");
    if (proof.status !== "submitted") throw new StaffActionError("This screenshot has already been checked.");
    if (!canReviewProofs(order.orderStatus)) throw new StaffActionError("This order's screenshots can't be checked any more.");
    if (input.decision === "approve" && proof.purpose === "goods") throw new StaffActionError("Enter the delivery charge and tap Approve order.");

    const status = input.decision === "approve" ? "verified" : "rejected";
    const rejectionReason = input.decision === "reject" ? input.reason : null;
    await updateProof(tx, proof.id, { status, rejectionReason, reviewedBy: actor.id, reviewedAt: now });

    const what = `${PROOF_PURPOSE_LABELS[proof.purpose]} screenshot`;
    const note = rejectionReason ? `${what} rejected: ${rejectionReason}` : `${what} approved`;
    const paymentStatus = recomputePaymentStatus({ ...order, proofs: await getProofSummaries(order.id, tx) }, features.deliveryChargeByTransfer);
    if (!(await writePaymentStatus(tx, order, paymentStatus, note, actor, now))) {
      await insertStatusHistory(tx, [{ orderId: order.id, kind: "note", note, changedBy: actor.id, createdAt: now }]);
    }

    const orderStatus = statusAfterPaymentReview(order.orderStatus, paymentStatus);
    if (orderStatus !== order.orderStatus) {
      await updateOrder(tx, order.id, { orderStatus });
      await writeOrderStatus(tx, order, orderStatus, "Delivery charge paid", actor, now);
    }

    await insertAuditLog(tx, {
      userId: actor.id,
      action: input.decision === "approve" ? "payment.approve" : "payment.reject",
      entity: "payment_proof",
      entityId: proof.id,
      oldValues: { status: proof.status },
      newValues: { status, rejectionReason, purpose: proof.purpose, orderNumber, orderPaymentStatus: paymentStatus },
      createdAt: now,
    });
  });
}

/** The fulfilment dropdown (C20): Sent (courier and tracking note optional) or Delivered, forward only. */
export async function updateFulfilment(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = fulfilmentSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  return withLockedOrder(input.orderNumber, async (tx, order, now) => {
    const plan = planFulfilment(order, input.status);
    if (!plan.ok) throw new StaffActionError(plan.error);

    const values: OrderUpdate = { orderStatus: plan.orderStatus };
    let note: string | null = null;
    if (input.status === "shipped") {
      values.courier = input.courier;
      values.trackingNote = input.trackingNote;
      note = [input.courier, input.trackingNote].filter(Boolean).join(" · ") || null;
    }
    await updateOrder(tx, order.id, values);
    await writeOrderStatus(tx, order, plan.orderStatus, note, actor, now);
    await writePaymentStatus(tx, order, plan.paymentStatus, "Cash collected on delivery", actor, now);
  });
}

/**
 * Reject or cancel the whole order, until it is sent, with the reason the customer sees. The
 * stock comes back once and the coupon use is released (C4).
 */
export async function closeOrder(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = closeOrderSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  return withLockedOrder(input.orderNumber, async (tx, order, now) => {
    const refusal = closeRefusal(order.orderStatus, input.action, input.reason);
    if (refusal) throw new StaffActionError(refusal);

    const orderStatus = closedStatus(input.action);
    await updateOrder(tx, order.id, { orderStatus, rejectionReason: input.reason });
    await writeOrderStatus(tx, order, orderStatus, input.reason, actor, now);

    const returned = [
      (await restoreStockOnce(tx, order.id, now)) ? "Items returned to stock" : null,
      (await releaseCouponUsage(tx, order.id)) ? `Coupon ${order.couponCode} use released` : null,
    ].filter(Boolean);
    if (returned.length > 0) {
      await insertStatusHistory(tx, [{ orderId: order.id, kind: "note", note: returned.join(". "), changedBy: actor.id, createdAt: now }]);
    }
  });
}

/** An internal note: a staff-only history row (`kind = 'note'`), never shown to the customer. */
export async function addOrderNote(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = orderNoteSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  return withLockedOrder(input.orderNumber, async (tx, order, now) => {
    await insertStatusHistory(tx, [{ orderId: order.id, kind: "note", note: input.note, changedBy: actor.id, createdAt: now }]);
  });
}
