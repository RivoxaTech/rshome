/**
 * What staff do to an order from the panel (ARCHITECTURE.md §4.3, owner decision C20). The
 * Server Actions check the permission; every function here validates its input, locks the order
 * row, re-checks the move under that lock, and records it in `order_status_history` (and
 * `audit_logs` for approvals, which set the delivery charge, and screenshot reviews) in the same
 * transaction.
 */
import { features } from "@/config/features";
import { insertAuditLog } from "@/features/audit/repo";
import { insertStatusHistory } from "@/features/checkout/repo";
import { getProofSummaries } from "@/features/payments/repo";
import { decimalToPaisa, formatMoney, paisaToDecimal } from "@/features/pricing/money";
import { totalWithDeliveryCharge } from "@/features/pricing/pricing";
import { db, type DbClient } from "@/server/db/client";
import { deleteProofFile } from "@/server/storage/proofs";
import { approveOrderSchema, approveWhatsappSchema, closeOrderSchema, deleteOrderSchema, fulfilmentSchema, orderNoteSchema, reviewProofSchema } from "./schemas";
import { latestProofStates, paymentProgress, type OrderStatus, type PaymentStatus } from "./status";
import {
  deleteOrderCascade,
  getLatestProof,
  getProof,
  getProofOrderNumber,
  insertWhatsappDeliveryProof,
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
  canMoveOrder,
  canMovePayment,
  canReviewProof,
  closeRefusal,
  closedStatus,
  planFulfilment,
  recomputePaymentStatus,
  statusAfterPaymentReview,
  type CloseAction,
} from "./transitions";
import { StaffActionError, invalidInput } from "@/features/shared/staff-result";
import type { StaffResult } from "@/features/shared/staff-result";

/** `orderNumber` comes back from `reviewProof` so the action can send the right email without a second lookup. */
export type StaffActionResult = StaffResult<{ orderNumber?: string }>;

/** The signed-in staff member, from `requirePermission`. */
type Actor = { id: number };
type LockedOrder = NonNullable<Awaited<ReturnType<typeof lockOrderByNumber>>>;

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
 * Cancel or reject the order (owner decision C4, D15): stock restored once, the coupon use
 * released, in the same transaction. Shared by `closeOrder` (the ⋮ menu) and `reviewProof`'s
 * reject branch (owner decision, S9: rejecting a screenshot rejects the whole order). `reason` is
 * the customer-visible `rejection_reason`; `note` is the staff activity line, which may say more.
 */
async function closeOrderTx(tx: DbClient, order: LockedOrder, action: CloseAction, reason: string, note: string, actor: Actor, now: Date) {
  const orderStatus = closedStatus(action);
  await updateOrder(tx, order.id, { orderStatus, rejectionReason: reason });
  await writeOrderStatus(tx, order, orderStatus, note, actor, now);

  const returned = [
    (await restoreStockOnce(tx, order.id, now)) ? "Items returned to stock" : null,
    (await releaseCouponUsage(tx, order.id)) ? `Coupon ${order.couponCode} use released` : null,
  ].filter(Boolean);
  if (returned.length > 0) {
    await insertStatusHistory(tx, [{ orderId: order.id, kind: "note", note: returned.join(". "), changedBy: actor.id, createdAt: now }]);
  }
}

/**
 * "Approve order" (C20): one step that sets the quoted delivery charge (C13), grows the total by
 * it, approves the products screenshot of a bank order, and moves the order on: to "Delivery
 * charge unpaid" when a bank customer must still transfer a charge above zero, else straight to
 * "Good to go". The payment summary is recomputed from the proofs (C19).
 */
export async function approveOrder(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = approveOrderSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
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
 * Approve a screenshot, whatever tab its open order is in (C22); in Need review the products
 * screenshot is approved by "Approve order" with the delivery charge instead. Rejecting a
 * screenshot rejects the whole order instead (owner decision, S9): the customer sees it as
 * Rejected with the reason and can never upload another screenshot for it. Every approval
 * recomputes the payment summary, and an order in Pending delivery charge moves to Processing
 * once every due payment is in.
 */
export async function reviewProof(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = reviewProofSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const orderNumber = await getProofOrderNumber(input.proofId);
  if (!orderNumber) return { ok: false, error: "Screenshot not found." };

  const result = await withLockedOrder(orderNumber, async (tx, order, now) => {
    const proof = await getProof(tx, input.proofId);
    if (!proof || proof.orderId !== order.id) throw new StaffActionError("Screenshot not found.");
    if (proof.status !== "submitted") throw new StaffActionError("This screenshot has already been checked.");
    if (!canReviewProof(order.orderStatus)) throw new StaffActionError("This order is closed, so its screenshots can't be checked.");
    if (input.decision === "approve" && proof.purpose === "goods" && order.orderStatus === "awaiting_shipping_quote") {
      throw new StaffActionError("Enter the delivery charge and tap Approve order.");
    }

    const what = `${PROOF_PURPOSE_LABELS[proof.purpose]} screenshot`;

    if (input.decision === "reject") {
      if (!canMoveOrder(order.orderStatus, "rejected")) throw new StaffActionError("This order can no longer be rejected.");
      await updateProof(tx, proof.id, { status: "rejected", rejectionReason: input.reason, reviewedBy: actor.id, reviewedAt: now });
      await closeOrderTx(tx, order, "reject", input.reason, `${what} rejected: ${input.reason}`, actor, now);

      const paymentStatus = recomputePaymentStatus({ ...order, proofs: await getProofSummaries(order.id, tx) }, features.deliveryChargeByTransfer);
      await writePaymentStatus(tx, order, paymentStatus, `${what} rejected`, actor, now);

      await insertAuditLog(tx, {
        userId: actor.id,
        action: "payment.reject",
        entity: "payment_proof",
        entityId: proof.id,
        oldValues: { status: proof.status },
        newValues: { status: "rejected", rejectionReason: input.reason, purpose: proof.purpose, orderNumber, orderStatus: "rejected" },
        createdAt: now,
      });
      return;
    }

    await updateProof(tx, proof.id, { status: "verified", rejectionReason: null, reviewedBy: actor.id, reviewedAt: now });

    const note = `${what} approved`;
    const paymentStatus = recomputePaymentStatus({ ...order, proofs: await getProofSummaries(order.id, tx) }, features.deliveryChargeByTransfer);
    if (!(await writePaymentStatus(tx, order, paymentStatus, note, actor, now))) {
      await insertStatusHistory(tx, [{ orderId: order.id, kind: "note", note, changedBy: actor.id, createdAt: now }]);
    }

    const orderStatus = statusAfterPaymentReview(order.orderStatus, paymentStatus);
    if (orderStatus !== order.orderStatus) {
      await updateOrder(tx, order.id, { orderStatus });
      await writeOrderStatus(tx, order, orderStatus, "All payments approved", actor, now);
    }

    await insertAuditLog(tx, {
      userId: actor.id,
      action: "payment.approve",
      entity: "payment_proof",
      entityId: proof.id,
      oldValues: { status: proof.status },
      newValues: { status: "verified", rejectionReason: null, purpose: proof.purpose, orderNumber, orderPaymentStatus: paymentStatus },
      createdAt: now,
    });
  });
  return result.ok ? { ok: true, orderNumber } : result;
}

/**
 * "Approve order (paid via WhatsApp)" (D63): a bank order in Pending delivery charge whose
 * customer sent the delivery-charge screenshot straight to the shop's WhatsApp instead of
 * uploading it here. Records a pre-verified `payment_proofs` row with no file, then reuses the
 * same recompute/advance logic `reviewProof` uses for a real screenshot — there is no separate
 * state machine for this.
 */
export async function approveDeliveryViaWhatsapp(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = approveWhatsappSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  return withLockedOrder(input.orderNumber, async (tx, order, now) => {
    if (order.paymentMethod !== "bank_transfer") throw new StaffActionError("This isn't a bank-transfer order.");
    if (order.orderStatus !== "pending") throw new StaffActionError("This order isn't waiting for its delivery charge.");
    const before = latestProofStates(await getProofSummaries(order.id, tx));
    if (before.delivery !== "missing") throw new StaffActionError("This order already has a delivery-charge screenshot — check it instead.");

    const proofId = await insertWhatsappDeliveryProof(tx, order.id, actor.id, now);

    const paymentStatus = recomputePaymentStatus({ ...order, proofs: await getProofSummaries(order.id, tx) }, features.deliveryChargeByTransfer);
    await writePaymentStatus(tx, order, paymentStatus, "Delivery charge payment verified via WhatsApp", actor, now);

    const orderStatus = statusAfterPaymentReview(order.orderStatus, paymentStatus);
    if (orderStatus !== order.orderStatus) {
      await updateOrder(tx, order.id, { orderStatus });
      await writeOrderStatus(tx, order, orderStatus, "Delivery charge confirmed via WhatsApp", actor, now);
    }

    await insertAuditLog(tx, {
      userId: actor.id,
      action: "payment.approve_whatsapp",
      entity: "payment_proof",
      entityId: proofId,
      oldValues: { delivery: before.delivery },
      newValues: { status: "verified", purpose: "delivery", channel: "whatsapp", orderNumber: order.orderNumber, orderPaymentStatus: paymentStatus },
      createdAt: now,
    });
  });
}

/** The fulfilment dropdown (C20): Sent (courier and tracking note optional) or Delivered, forward only. */
export async function updateFulfilment(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = fulfilmentSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
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
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  return withLockedOrder(input.orderNumber, async (tx, order, now) => {
    const refusal = closeRefusal(order.orderStatus, input.action, input.reason);
    if (refusal) throw new StaffActionError(refusal);
    await closeOrderTx(tx, order, input.action, input.reason, input.reason, actor, now);
  });
}

/** An internal note: a staff-only history row (`kind = 'note'`), never shown to the customer. */
export async function addOrderNote(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = orderNoteSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  return withLockedOrder(input.orderNumber, async (tx, order, now) => {
    await insertStatusHistory(tx, [{ orderId: order.id, kind: "note", note: input.note, changedBy: actor.id, createdAt: now }]);
  });
}

/**
 * Permanently deletes a closed (cancelled or rejected) order and everything that hangs off it
 * (owner decision, S9 follow-up): there's nothing left to cancel or reject, only to clean up.
 * The proof files are removed from disk once the transaction that deleted their rows has
 * committed. `audit_logs` keeps its own row for this, since it isn't tied to the order by a
 * foreign key and outlives it on purpose.
 */
export async function deleteOrder(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = deleteOrderSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  let proofFilePaths: string[] = [];
  const result = await withLockedOrder(input.orderNumber, async (tx, order, now) => {
    if (order.orderStatus !== "cancelled" && order.orderStatus !== "rejected") {
      throw new StaffActionError("Only a cancelled or rejected order can be deleted.");
    }
    const cascade = await deleteOrderCascade(tx, order.id);
    proofFilePaths = cascade.proofFilePaths;
    await insertAuditLog(tx, {
      userId: actor.id,
      action: "order.delete",
      entity: "order",
      entityId: order.orderNumber,
      oldValues: { orderStatus: order.orderStatus, rejectionReason: order.rejectionReason },
      newValues: { deleted: true },
      createdAt: now,
    });
  });

  if (result.ok) {
    for (const filePath of proofFilePaths) await deleteProofFile(filePath);
  }
  return result;
}
