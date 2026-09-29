/**
 * Order status logic on plain data (ARCHITECTURE.md §4.3): no DB or I/O. S7 adds the customer
 * timeline; S9 adds the transition rules for staff actions.
 */
import type { orders } from "@/server/db/schema/orders";

type OrderRow = typeof orders.$inferSelect;
export type OrderStatus = OrderRow["orderStatus"];
export type PaymentStatus = OrderRow["paymentStatus"];
export type PaymentMethod = OrderRow["paymentMethod"];

export type TimelineOrder = Pick<
  OrderRow,
  "orderStatus" | "paymentStatus" | "paymentMethod" | "rejectionReason" | "courier" | "trackingNote"
>;

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

/** One friendly line for the page heading. */
export function statusHeadline(order: TimelineOrder): string {
  switch (order.orderStatus) {
    case "awaiting_shipping_quote":
      return "Waiting for delivery charge";
    case "pending":
      if (order.paymentMethod !== "bank_transfer" || order.paymentStatus === "verified") return "Waiting for confirmation";
      return order.paymentStatus === "proof_submitted" ? "Payment under review" : "Awaiting payment";
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

/**
 * The steps the customer sees. Bank orders carry two payment steps between the delivery charge
 * and confirmation; COD orders pay on delivery, so they have none. A cancelled or rejected
 * order shows what happened and why instead of the path.
 */
export function buildTimeline(order: TimelineOrder): TimelineStep[] {
  if (order.orderStatus === "cancelled" || order.orderStatus === "rejected") {
    return [
      { label: "Order placed", state: "done", note: null },
      { label: statusHeadline(order), state: "current", note: order.rejectionReason },
    ];
  }

  const rank = ORDER_RANK[order.orderStatus];
  const steps: TimelineStep[] = [{ label: "Waiting for delivery charge", state: stepState(rank, 0), note: null }];

  if (order.paymentMethod === "bank_transfer") {
    // Past `pending` the state machine guarantees the payment was verified (§4.3).
    const verified = order.paymentStatus === "verified" || rank > 1;
    const underReview = rank === 1 && order.paymentStatus === "proof_submitted";
    const awaiting = rank === 1 && !verified && !underReview;
    steps.push({
      label: "Awaiting payment",
      state: verified || underReview ? "done" : awaiting ? "current" : "upcoming",
      note: awaiting && order.paymentStatus === "rejected" ? PAYMENT_REJECTED_NOTE : null,
    });
    steps.push({ label: "Payment under review", state: verified ? "done" : underReview ? "current" : "upcoming", note: null });
  }

  steps.push(
    { label: "Confirmed", state: stepState(rank, 2), note: null },
    { label: "Being prepared", state: stepState(rank, 3), note: null },
    { label: "Shipped", state: stepState(rank, 4), note: rank >= 4 ? shippedNote(order) : null },
    { label: "Delivered", state: rank === 5 ? "done" : "upcoming", note: null },
  );
  return steps;
}
