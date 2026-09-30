/**
 * The staff side of the order status machine (ARCHITECTURE.md §4.3, owner decisions C20, C21),
 * on plain data: which order and payment moves are allowed, which tab an order sits in, what the
 * status dropdown offers next, and what each panel action does. No DB or I/O.
 */
import type { orders } from "@/server/db/schema/orders";
import {
  paymentProgress,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ProofPurpose,
  type ProofState,
  type TimelineOrder,
} from "./status";

type OrderRow = typeof orders.$inferSelect;

/** In the panel's words (the tab names), for the activity timeline. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_shipping_quote: "Need review",
  pending: "Pending delivery charge",
  confirmed: "Processing",
  processing: "Processing",
  shipped: "Delivery",
  delivered: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  proof_submitted: "Screenshot to check",
  verified: "Paid",
  rejected: "Screenshot rejected",
  cod_pending: "Cash on delivery",
  cod_collected: "Cash collected",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cod: "Cash on delivery", bank_transfer: "Bank transfer" };
export const PROOF_PURPOSE_LABELS: Record<ProofPurpose, string> = { goods: "Products", delivery: "Delivery charge" };

/**
 * Every allowed move. Approval takes a new order to `pending` (a bank order that still owes the
 * delivery charge) or straight to `processing`. Fulfilment only goes forward and may skip
 * `shipped` (Delivery). Reject and cancel work until the order is out for delivery, and nothing
 * leaves a closed state, so the stock comes back once. `confirmed` is no longer entered; an
 * order already there counts as Processing.
 */
const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  awaiting_shipping_quote: ["pending", "processing", "rejected", "cancelled"],
  pending: ["processing", "rejected", "cancelled"],
  confirmed: ["shipped", "delivered", "rejected", "cancelled"],
  processing: ["shipped", "delivered", "rejected", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  rejected: [],
};

/**
 * Upload (`unpaid | rejected → proof_submitted`), review (`proof_submitted → verified | rejected |
 * unpaid`, the last when the products are approved and the delivery charge is now due), an order
 * paid before its charge was set (`verified → unpaid`), and cash collected on delivery.
 */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  unpaid: ["proof_submitted"],
  rejected: ["proof_submitted"],
  proof_submitted: ["verified", "rejected", "unpaid"],
  verified: ["unpaid"],
  cod_pending: ["cod_collected"],
  cod_collected: [],
};

export function canMoveOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canMovePayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** Before approval is complete: staff review screenshots and the customer can still upload them. */
export function canReviewProofs(orderStatus: OrderStatus): boolean {
  return orderStatus === "awaiting_shipping_quote" || orderStatus === "pending";
}

/**
 * The order-level payment summary (C19, D34), derived from each payment's latest proof and the
 * delivery charge. Only payments that are due count: the products always, the delivery charge
 * once set, above zero and paid by transfer. A screenshot waiting for review wins, then a
 * rejected one, then a missing one; `verified` means every due payment is approved. COD orders
 * keep their status: their payment moves only on delivery.
 */
export function recomputePaymentStatus(
  order: TimelineOrder & Pick<OrderRow, "paymentStatus">,
  deliveryChargeByTransfer: boolean,
): PaymentStatus {
  if (order.paymentMethod !== "bank_transfer") return order.paymentStatus;
  const progress = paymentProgress(order, deliveryChargeByTransfer);
  const due = [progress.goods, progress.delivery].filter(
    (state): state is ProofState => state !== "not_due" && state !== "awaiting_charge",
  );
  if (due.includes("submitted")) return "proof_submitted";
  if (due.includes("rejected")) return "rejected";
  if (due.includes("missing")) return "unpaid";
  return "verified";
}

// ── Order tabs (C21) ────────────────────────────────────────────────────────────────────────

/**
 * The tabs of the two orders pages (owner decision C21), in their order after "All". Cash on
 * delivery has no "Pending delivery charge": its customer pays everything on delivery.
 */
export const ORDER_TABS = ["need_review", "pending_delivery", "processing", "delivery", "completed", "cancelled", "rejected"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export const TAB_INFO: Record<OrderTab, { slug: string; label: string }> = {
  need_review: { slug: "need-review", label: "Need review" },
  pending_delivery: { slug: "pending-delivery", label: "Pending delivery charge" },
  processing: { slug: "processing", label: "Processing" },
  delivery: { slug: "delivery", label: "Delivery" },
  completed: { slug: "completed", label: "Completed" },
  cancelled: { slug: "cancelled", label: "Cancelled" },
  rejected: { slug: "rejected", label: "Rejected" },
};

export function tabsFor(method: PaymentMethod): OrderTab[] {
  return ORDER_TABS.filter((tab) => method === "bank_transfer" || tab !== "pending_delivery");
}

/** The two orders pages, one per payment method (C21). */
export const METHOD_PAGES: Record<PaymentMethod, { slug: "bank" | "cod"; title: string; navLabel: string }> = {
  bank_transfer: { slug: "bank", title: "Orders – Bank transfer", navLabel: "Orders – Bank transfer" },
  cod: { slug: "cod", title: "Orders – Cash on delivery", navLabel: "Orders – COD" },
};

/** A method's page with its tab, search and page in the URL: `/panel/orders/bank?tab=need-review&q=ali&page=2`. */
export function ordersPath(method: PaymentMethod, tab: OrderTab | "all" = "all", { q, page }: { q?: string; page?: number } = {}): string {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("tab", TAB_INFO[tab].slug);
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/panel/orders/${METHOD_PAGES[method].slug}${search ? `?${search}` : ""}`;
}

export type QueueOrder = Pick<OrderRow, "paymentMethod" | "orderStatus" | "paymentStatus">;

/**
 * The one tab an order sits in on its method's page. `pending` is a bank order owing the delivery
 * charge; the current flow never puts a COD order there, and one left there by hand shows under
 * Need review. The SQL in staff-repo.ts (`TAB_CONDITIONS`) states the same rules.
 */
export function orderTab(order: QueueOrder): OrderTab {
  switch (order.orderStatus) {
    case "awaiting_shipping_quote":
      return "need_review";
    case "pending":
      return order.paymentMethod === "bank_transfer" ? "pending_delivery" : "need_review";
    case "confirmed":
    case "processing":
      return "processing";
    case "shipped":
      return "delivery";
    case "delivered":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "rejected":
      return "rejected";
  }
}

/** A delivery charge screenshot waiting for staff: the alert dot, and part of the sidebar badge. */
export function deliveryScreenshotToCheck(order: QueueOrder): boolean {
  return order.paymentMethod === "bank_transfer" && order.orderStatus === "pending" && order.paymentStatus === "proof_submitted";
}

/** An order waiting for staff: a new one to review, or a delivery charge screenshot to check (the sidebar badge). */
export function needsAction(order: QueueOrder): boolean {
  return order.orderStatus === "awaiting_shipping_quote" || deliveryScreenshotToCheck(order);
}

/** A step the status dropdown offers; each opens a dialog. */
export type StatusAction = "approve" | "check_delivery" | "ship" | "complete" | "cancel" | "reject";

/**
 * What staff can do next (C21): only forward moves this order can make now, never back, then
 * cancel and reject until it is out for delivery. A bank order waiting for a new products
 * screenshot, or for its delivery charge screenshot, offers nothing forward. The Server Action
 * checks the move again under the order lock.
 */
export function statusActions(order: QueueOrder, goods: ProofState | "not_due"): StatusAction[] {
  const actions: StatusAction[] = [];
  if (order.orderStatus === "awaiting_shipping_quote" && approvalRefusal(order, goods) === null) actions.push("approve");
  if (deliveryScreenshotToCheck(order)) actions.push("check_delivery");
  const targets = fulfilmentTargets(order.orderStatus);
  if (targets.includes("shipped")) actions.push("ship");
  if (targets.includes("delivered")) actions.push("complete");
  if (canClose(order.orderStatus)) actions.push("cancel", "reject");
  return actions;
}

/** The tab an action takes the order to, which the dropdown shows as the option. */
export function actionTarget(action: StatusAction, paymentMethod: PaymentMethod, deliveryChargeByTransfer: boolean): OrderTab {
  switch (action) {
    case "approve":
      return paymentMethod === "bank_transfer" && deliveryChargeByTransfer ? "pending_delivery" : "processing";
    case "check_delivery":
      return "processing";
    case "ship":
      return "delivery";
    case "complete":
      return "completed";
    case "cancel":
      return "cancelled";
    case "reject":
      return "rejected";
  }
}

// ── Approve order: the delivery charge and the products screenshot in one step ──────────────

/**
 * Why "Approve order" can't run, or null when it can. A new order only, and a bank order needs a
 * products screenshot to approve (or one already approved). The amount itself is validated by
 * the form schema; it may be 0.
 */
export function approvalRefusal(order: QueueOrder, goods: ProofState | "not_due"): string | null {
  if (order.orderStatus === "cancelled" || order.orderStatus === "rejected") return "This order is closed.";
  if (order.orderStatus !== "awaiting_shipping_quote") return "This order is already approved.";
  if (order.paymentMethod === "bank_transfer" && goods !== "submitted" && goods !== "verified") {
    return "Waiting for a new payment screenshot from the customer.";
  }
  return null;
}

/**
 * Where approval takes the order: a bank order that must still transfer a delivery charge waits
 * for it (`pending`, "Pending delivery charge"); everything else goes to Processing. COD pays the
 * lot in cash on delivery.
 */
export function approvedStatus(paymentMethod: PaymentMethod, deliveryCharge: number, deliveryChargeByTransfer: boolean): OrderStatus {
  return paymentMethod === "bank_transfer" && deliveryChargeByTransfer && deliveryCharge > 0 ? "pending" : "processing";
}

/** Once the delivery charge screenshot is approved, the order moves to Processing. */
export function statusAfterPaymentReview(orderStatus: OrderStatus, paymentStatus: PaymentStatus): OrderStatus {
  return orderStatus === "pending" && paymentStatus === "verified" ? "processing" : orderStatus;
}

// ── Fulfilment: Delivery (`shipped`) and Completed (`delivered`), forward only ───────────────

type FulfilmentTarget = "shipped" | "delivered";
const FULFILMENT_TARGETS: readonly FulfilmentTarget[] = ["shipped", "delivered"];
const FULFILMENT_WORDS: Record<FulfilmentTarget, string> = { shipped: "sent", delivered: "delivered" };

/** The fulfilment moves an order can make now: only forward ones. */
export function fulfilmentTargets(orderStatus: OrderStatus): FulfilmentTarget[] {
  return FULFILMENT_TARGETS.filter((target) => canMoveOrder(orderStatus, target));
}

/** A fulfilment move; completing a COD order records the cash as collected. */
export function planFulfilment(
  order: QueueOrder,
  target: FulfilmentTarget,
): { ok: true; orderStatus: OrderStatus; paymentStatus: PaymentStatus } | { ok: false; error: string } {
  if (!fulfilmentTargets(order.orderStatus).includes(target)) {
    return { ok: false, error: `This order can't be marked ${FULFILMENT_WORDS[target]} now.` };
  }
  const collectsCash = target === "delivered" && canMovePayment(order.paymentStatus, "cod_collected");
  return { ok: true, orderStatus: target, paymentStatus: collectsCash ? "cod_collected" : order.paymentStatus };
}

// ── Reject or cancel the whole order ────────────────────────────────────────────────────────

export type CloseAction = "reject" | "cancel";
const CLOSE_TARGET: Record<CloseAction, OrderStatus> = { reject: "rejected", cancel: "cancelled" };

/** Allowed until the order is out for delivery, with a reason the customer sees. Null when it may go ahead. */
export function closeRefusal(orderStatus: OrderStatus, action: CloseAction, reason: string): string | null {
  if (!canMoveOrder(orderStatus, CLOSE_TARGET[action])) {
    if (orderStatus === "cancelled" || orderStatus === "rejected") return "This order is already closed.";
    // Only an order out for delivery or completed is still open here.
    const done = FULFILMENT_WORDS[orderStatus as FulfilmentTarget];
    return `An order that has been ${done} can't be ${action === "reject" ? "rejected" : "cancelled"}.`;
  }
  return reason.trim() ? null : "Enter a reason.";
}

export function closedStatus(action: CloseAction): OrderStatus {
  return CLOSE_TARGET[action];
}

export function canClose(orderStatus: OrderStatus): boolean {
  return canMoveOrder(orderStatus, "cancelled");
}
