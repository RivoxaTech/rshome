/**
 * The customer side of an order on plain data (ARCHITECTURE.md §4.3): the payment progress of a
 * bank-transfer order, what a customer upload would pay for, the headline and the timeline. No DB
 * or I/O. The staff rules are in transitions.ts.
 */
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
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

/** Where an open order sits on its path (C20); closed orders have no rank. */
const ORDER_RANK: Record<OrderStatus, number> = {
  awaiting_shipping_quote: 0,
  pending: 1,
  confirmed: 2,
  processing: 2,
  shipped: 3,
  delivered: 4,
  cancelled: -1,
  rejected: -1,
};

/** Each payment's latest screenshot, due or not. `proofs` are newest first. */
export type LatestProofs = Record<ProofPurpose, ProofState>;

export function latestProofStates(proofs: Pick<ProofSummary, "purpose" | "status">[]): LatestProofs {
  const latest = (purpose: ProofPurpose) => proofs.find((proof) => proof.purpose === purpose)?.status ?? "missing";
  return { goods: latest("goods"), delivery: latest("delivery") };
}

export function paymentProgress(order: TimelineOrder, deliveryChargeByTransfer: boolean): PaymentProgress {
  if (order.paymentMethod !== "bank_transfer") return { goods: "not_due", delivery: "not_due" };
  const { goods, delivery } = latestProofStates(order.proofs);
  if (!deliveryChargeByTransfer) return { goods, delivery: "not_due" };
  if (order.shippingTotal === null) return { goods, delivery: "awaiting_charge" };
  if (decimalToPaisa(order.shippingTotal) === 0) return { goods, delivery: "not_due" };
  return { goods, delivery };
}

const needsUpload = (state: PaymentProgress[keyof PaymentProgress]) => state === "missing";

/**
 * What a customer upload would pay for right now, or null when nothing is due. Only open orders
 * that are not yet confirmed take uploads (a bank order is confirmed only once paid, §4.3), and
 * the delivery charge only once staff have set it (PAY-06). A screenshot is never re-uploaded once
 * rejected (owner decision, S9): rejecting a screenshot rejects the whole order in the same
 * transaction, so a `rejected` proof is never seen on an order that is still open.
 */
export function uploadPurpose(order: TimelineOrder, progress: PaymentProgress): ProofPurpose | null {
  if (order.orderStatus !== "awaiting_shipping_quote" && order.orderStatus !== "pending") return null;
  if (needsUpload(progress.goods)) return "goods";
  if (needsUpload(progress.delivery)) return "delivery";
  return null;
}

function money(decimal: string | null): string {
  return decimal === null ? "" : formatMoney(decimalToPaisa(decimal));
}

/** One friendly line for the page heading, matching the stage the shop sees (C20). */
export function statusHeadline(order: TimelineOrder, progress: PaymentProgress): string {
  const bank = order.paymentMethod === "bank_transfer";
  switch (order.orderStatus) {
    case "awaiting_shipping_quote":
      if (!bank) return "Order received";
      return progress.goods === "missing" ? "Please upload your payment screenshot" : "Payment being checked";
    case "pending":
      if (progress.delivery === "missing") return `Order approved – please pay the delivery charge of ${money(order.shippingTotal)}`;
      if (progress.delivery === "submitted") return "Order approved – delivery charge being checked";
      return "Order approved";
    case "confirmed":
    case "processing":
      return "Order approved";
    case "shipped":
      return "On its way";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "rejected":
      return "Rejected";
  }
}

function sentNote(order: TimelineOrder): string | null {
  const parts = [order.courier, order.trackingNote].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

function goodsNote(state: PaymentProgress["goods"]): string | null {
  if (state === "submitted") return "We're checking your payment screenshot.";
  return state === "missing" ? "Please upload your payment screenshot." : null;
}

function deliveryNote(order: TimelineOrder, state: PaymentProgress["delivery"]): string | null {
  if (state === "missing") return `Transfer ${money(order.shippingTotal)} and upload the screenshot.`;
  return state === "submitted" ? "Screenshot received. We're checking it." : null;
}

/**
 * The steps the customer sees (C20). Bank transfer: Order placed, Payment checked, Approved,
 * Delivery charge paid (only when one is due by transfer), Processing, Sent, Delivered. Cash on
 * delivery: Order placed, Approved, Processing, Sent, Delivered. The first step not done is the
 * current one. A cancelled or rejected order shows what happened and why instead of the path.
 */
export function buildTimeline(order: TimelineOrder, progress: PaymentProgress): TimelineStep[] {
  if (order.orderStatus === "cancelled" || order.orderStatus === "rejected") {
    return [
      { label: "Order placed", state: "done", note: null },
      { label: statusHeadline(order, progress), state: "current", note: order.rejectionReason },
    ];
  }

  const rank = ORDER_RANK[order.orderStatus];
  const steps: { label: string; done: boolean; note: string | null }[] = [{ label: "Order placed", done: true, note: null }];
  if (order.paymentMethod === "bank_transfer") {
    steps.push({ label: "Payment checked", done: rank >= 1 || progress.goods === "verified", note: rank >= 1 ? null : goodsNote(progress.goods) });
  }
  steps.push({ label: "Approved", done: rank >= 1, note: null });
  if (order.paymentMethod === "bank_transfer" && progress.delivery !== "not_due") {
    steps.push({ label: "Delivery charge paid", done: rank >= 2 || progress.delivery === "verified", note: rank === 1 ? deliveryNote(order, progress.delivery) : null });
  }
  steps.push(
    { label: "Processing", done: rank >= 3, note: null },
    { label: "Sent", done: rank >= 4, note: rank >= 3 ? sentNote(order) : null },
    { label: "Delivered", done: rank >= 4, note: null },
  );

  const current = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({
    label: step.label,
    state: step.done ? "done" : index === current ? "current" : "upcoming",
    note: step.note,
  }));
}
