/**
 * Order status logic on plain data (ARCHITECTURE.md §4.3): no DB or I/O. S7 adds the customer
 * timeline, S8 the payment progress of a bank-transfer order; S9 adds the transition rules for
 * staff actions.
 */
import { decimalToPaisa } from "@/features/pricing/money";
import type { orders, paymentProofs } from "@/server/db/schema/orders";

type OrderRow = typeof orders.$inferSelect;
type ProofRow = typeof paymentProofs.$inferSelect;
export type OrderStatus = OrderRow["orderStatus"];
export type PaymentStatus = OrderRow["paymentStatus"];
export type PaymentMethod = OrderRow["paymentMethod"];
export type ProofPurpose = ProofRow["purpose"];

export type ProofSummary = Pick<ProofRow, "purpose" | "status" | "rejectionReason">;

export type TimelineOrder = Pick<
  OrderRow,
  "orderStatus" | "paymentMethod" | "rejectionReason" | "courier" | "trackingNote" | "shippingTotal"
> & {
  /** The order's payment screenshots, newest first. */
  proofs: ProofSummary[];
};

/** The latest screenshot for one payment, or `missing` when none was uploaded. */
export type ProofState = "missing" | ProofRow["status"];

/**
 * Owner decision (S8): a bank-transfer customer pays the goods at checkout, screenshot required,
 * and the delivery charge once staff have quoted it: by a second transfer and screenshot while
 * `deliveryChargeByTransfer` is on, in cash on delivery otherwise.
 */
export type PaymentProgress = {
  goods: ProofState | "not_due";
  delivery: ProofState | "not_due" | "awaiting_charge";
};

export type TimelineStep = {
  label: string;
  state: "done" | "current" | "upcoming";
  note: string | null;
};

/** Where an open order sits on its path; closed orders have no rank. */
const ORDER_RANK: Record<OrderStatus, number> = {
  awaiting_shipping_quote: 0,
  pending: 1,
  confirmed: 2,
  processing: 3,
  shipped: 4,
  delivered: 5,
  cancelled: -1,
  rejected: -1,
};

export const PAYMENT_REJECTED_NOTE = "Your payment screenshot was not accepted. Please upload a new one.";

function latestProof(order: TimelineOrder, purpose: ProofPurpose): ProofSummary | undefined {
  return order.proofs.find((proof) => proof.purpose === purpose);
}

export function paymentProgress(order: TimelineOrder, deliveryChargeByTransfer: boolean): PaymentProgress {
  if (order.paymentMethod !== "bank_transfer") return { goods: "not_due", delivery: "not_due" };
  const goods = latestProof(order, "goods")?.status ?? "missing";
  if (!deliveryChargeByTransfer) return { goods, delivery: "not_due" };
  if (order.shippingTotal === null) return { goods, delivery: "awaiting_charge" };
  if (decimalToPaisa(order.shippingTotal) === 0) return { goods, delivery: "not_due" };
  return { goods, delivery: latestProof(order, "delivery")?.status ?? "missing" };
}

const needsUpload = (state: PaymentProgress[keyof PaymentProgress]) => state === "missing" || state === "rejected";

/**
 * What a customer upload would pay for right now, or null when nothing is due. Only open orders
 * that are not yet confirmed take uploads (a bank order is confirmed only once paid, §4.3), and
 * the delivery charge only once staff have set it (PAY-06).
 */
export function uploadPurpose(order: TimelineOrder, progress: PaymentProgress): ProofPurpose | null {
  if (order.orderStatus !== "awaiting_shipping_quote" && order.orderStatus !== "pending") return null;
  if (needsUpload(progress.goods)) return "goods";
  if (needsUpload(progress.delivery)) return "delivery";
  return null;
}

/** Staff's reason on the latest screenshot for `purpose`, when it was rejected. */
export function proofRejectionReason(order: TimelineOrder, purpose: ProofPurpose): string | null {
  const proof = latestProof(order, purpose);
  return proof?.status === "rejected" ? proof.rejectionReason : null;
}

/** One friendly line for the page heading. */
export function statusHeadline(order: TimelineOrder, progress: PaymentProgress): string {
  switch (order.orderStatus) {
    case "awaiting_shipping_quote":
      return needsUpload(progress.goods) ? "Awaiting payment" : "Waiting for delivery charge";
    case "pending": {
      const payments = [progress.goods, progress.delivery];
      if (payments.some(needsUpload)) return "Awaiting payment";
      return payments.includes("submitted") ? "Payment under review" : "Waiting for confirmation";
    }
    case "confirmed":
      return "Confirmed";
    case "processing":
      return "Being prepared";
    case "shipped":
      return "Shipped";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "rejected":
      return "Rejected";
  }
}

function stepState(rank: number, stepRank: number): TimelineStep["state"] {
  if (rank > stepRank) return "done";
  return rank === stepRank ? "current" : "upcoming";
}

function shippedNote(order: TimelineOrder): string | null {
  const parts = [order.courier, order.trackingNote].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

function rejectedNote(reason: string | null): string {
  return reason ? `${PAYMENT_REJECTED_NOTE} Reason: ${reason}` : PAYMENT_REJECTED_NOTE;
}

/** Past `pending` the state machine guarantees every payment was verified (§4.3). */
function goodsStep(order: TimelineOrder, state: ProofState, rank: number): TimelineStep {
  if (rank > 1 || state === "verified") return { label: "Payment under review", state: "done", note: null };
  if (state === "submitted") return { label: "Payment under review", state: "current", note: null };
  const note = state === "rejected" ? rejectedNote(proofRejectionReason(order, "goods")) : null;
  return { label: "Awaiting payment", state: "current", note };
}

function deliveryStep(order: TimelineOrder, state: Exclude<PaymentProgress["delivery"], "not_due">, rank: number): TimelineStep {
  const label = "Delivery charge payment";
  if (rank > 1 || state === "verified") return { label, state: "done", note: null };
  if (state === "awaiting_charge") return { label, state: "upcoming", note: null };
  if (state === "submitted") return { label, state: "current", note: "Screenshot received. We're checking it." };
  if (state === "rejected") return { label, state: "current", note: rejectedNote(proofRejectionReason(order, "delivery")) };
  return { label, state: "current", note: "Transfer the delivery charge and upload the screenshot." };
}

/**
 * The steps the customer sees. A bank order's goods payment is under review from checkout on,
 * alongside the wait for the delivery charge, and its delivery charge payment follows once the
 * charge is set; COD orders pay on delivery, so they have no payment steps. A cancelled or
 * rejected order shows what happened and why instead of the path.
 */
export function buildTimeline(order: TimelineOrder, progress: PaymentProgress): TimelineStep[] {
  if (order.orderStatus === "cancelled" || order.orderStatus === "rejected") {
    return [
      { label: "Order placed", state: "done", note: null },
      { label: statusHeadline(order, progress), state: "current", note: order.rejectionReason },
    ];
  }

  const rank = ORDER_RANK[order.orderStatus];
  const steps: TimelineStep[] = [];
  if (progress.goods !== "not_due") steps.push(goodsStep(order, progress.goods, rank));
  steps.push({ label: "Waiting for delivery charge", state: stepState(rank, 0), note: null });
  if (progress.delivery !== "not_due") steps.push(deliveryStep(order, progress.delivery, rank));

  steps.push(
    { label: "Confirmed", state: stepState(rank, 2), note: null },
    { label: "Being prepared", state: stepState(rank, 3), note: null },
    { label: "Shipped", state: stepState(rank, 4), note: rank >= 4 ? shippedNote(order) : null },
    { label: "Delivered", state: rank === 5 ? "done" : "upcoming", note: null },
  );
  return steps;
}
