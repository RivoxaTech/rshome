/**
 * The staff side of the order status machine (ARCHITECTURE.md §4.3, owner decisions C20, C21),
 * on plain data: which order and payment moves are allowed, which tab an order sits in, what the
 * status dropdown offers next, and what each panel action does. No DB or I/O.
 */
import type { orders } from "@/server/db/schema/orders";
import {
  paymentProgress,
  type LatestProofs,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ProofPurpose,
  type ProofState,
  type TimelineOrder,
} from "./status";
import { DEFAULT_PAGE_SIZE } from "@/features/shared/pagination";

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
 * paid before its charge was set (`verified → unpaid`), cash collected on delivery, and a delivery
 * charge confirmed on WhatsApp (`unpaid → verified`, D63): there is no screenshot to submit, so it
 * skips `proof_submitted` entirely.
 */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  unpaid: ["proof_submitted", "verified"],
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

/**
 * A screenshot waiting for staff can be checked whatever tab its order is in, as long as the
 * order is open (C22). In Need review the products screenshot is approved by "Approve order".
 */
export function canReviewProof(orderStatus: OrderStatus): boolean {
  return orderStatus !== "cancelled" && orderStatus !== "rejected";
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

/** A method's page with its tab, search, page and page size in the URL: `/panel/orders/bank?tab=need-review&q=ali&page=2`. */
export function ordersPath(
  method: PaymentMethod,
  tab: OrderTab | "all" = "all",
  { q, page, pageSize }: { q?: string; page?: number; pageSize?: number } = {},
): string {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("tab", TAB_INFO[tab].slug);
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  if (pageSize && pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
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

/** An order with each payment's latest screenshot (products and delivery charge), as the flags need it. */
export type FlagOrder = QueueOrder & { latest: LatestProofs };

const PROOF_PURPOSES: readonly ProofPurpose[] = ["goods", "delivery"];

/** The products screenshot of a bank order, or `not_due` for cash on delivery. */
export function goodsState(order: FlagOrder): ProofState | "not_due" {
  return order.paymentMethod === "bank_transfer" ? order.latest.goods : "not_due";
}

/**
 * The screenshots staff still have to check (C22), products first: a payment whose latest
 * screenshot is `submitted`, on an open bank order. In Need review the products screenshot is
 * part of the order review ("Approve order"), so it doesn't count here.
 */
export function screenshotsToCheck(order: FlagOrder): ProofPurpose[] {
  if (order.paymentMethod !== "bank_transfer" || !canReviewProof(order.orderStatus)) return [];
  return PROOF_PURPOSES.filter(
    (purpose) => order.latest[purpose] === "submitted" && !(purpose === "goods" && order.orderStatus === "awaiting_shipping_quote"),
  );
}

/** The alert dot on the row and the tab, and part of the sidebar badge. */
export function screenshotToCheck(order: FlagOrder): boolean {
  return screenshotsToCheck(order).length > 0;
}

/**
 * An order waiting for staff (the sidebar badge): a new order they can approve, or a screenshot
 * to check. A bank order still waiting for its first or a new products screenshot waits for the
 * customer, not for staff.
 */
export function needsAction(order: FlagOrder): boolean {
  const approvable = order.orderStatus === "awaiting_shipping_quote" && approvalRefusal(order, goodsState(order)) === null;
  return approvable || screenshotToCheck(order);
}

/** A step the status menu offers; each opens a dialog. */
export type StatusAction = "approve" | "check_screenshot" | "approve_whatsapp" | "ship" | "complete" | "cancel" | "reject";

/**
 * What staff can do next (C21, C22): only forward moves this order can make now, never back, then
 * cancel and reject until it is out for delivery. Pending delivery charge moves on to Processing
 * by checking the screenshots, once both payments are in, or (D63) by recording a delivery-charge
 * payment the customer confirmed on WhatsApp instead of uploading here, once the products screenshot
 * is already verified and no delivery screenshot has shown up yet. A bank order waiting for the
 * customer with neither option available offers nothing forward. The Server Action checks the move
 * again under the order lock.
 */
export function statusActions(order: FlagOrder): StatusAction[] {
  const actions: StatusAction[] = [];
  if (order.orderStatus === "awaiting_shipping_quote" && approvalRefusal(order, goodsState(order)) === null) actions.push("approve");
  const bothIn = PROOF_PURPOSES.every((purpose) => order.latest[purpose] === "submitted" || order.latest[purpose] === "verified");
  if (order.orderStatus === "pending" && screenshotToCheck(order) && bothIn) actions.push("check_screenshot");
  if (order.orderStatus === "pending" && order.paymentMethod === "bank_transfer" && order.latest.goods === "verified" && order.latest.delivery === "missing") {
    actions.push("approve_whatsapp");
  }
  const targets = fulfilmentTargets(order.orderStatus);
  if (targets.includes("shipped")) actions.push("ship");
  if (targets.includes("delivered")) actions.push("complete");
  if (canClose(order.orderStatus)) actions.push("cancel", "reject");
  return actions;
}

/** The tab an action takes the order to, which the status menu shows as the option. */
export function actionTarget(action: StatusAction, paymentMethod: PaymentMethod, deliveryChargeByTransfer: boolean): OrderTab {
  switch (action) {
    case "approve":
      return paymentMethod === "bank_transfer" && deliveryChargeByTransfer ? "pending_delivery" : "processing";
    case "check_screenshot":
      return "processing";
    case "approve_whatsapp":
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
 * products screenshot to approve. The amount itself is validated by the form schema; it may be 0.
 * A rejected screenshot rejects the whole order in the same transaction (owner decision, S9), so a
 * bank order in Need review never has a rejected products screenshot; `goods` is checked the same
 * way as `missing` regardless, for a total function.
 */
export function approvalRefusal(order: QueueOrder, goods: ProofState | "not_due"): string | null {
  if (order.orderStatus === "cancelled" || order.orderStatus === "rejected") return "This order is closed.";
  if (order.orderStatus !== "awaiting_shipping_quote") return "This order is already approved.";
  if (order.paymentMethod === "bank_transfer" && goods !== "submitted" && goods !== "verified") {
    return "The customer hasn't uploaded a payment screenshot yet.";
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

/** Once every due payment is approved, an order in Pending delivery charge moves to Processing. */
export function statusAfterPaymentReview(orderStatus: OrderStatus, paymentStatus: PaymentStatus): OrderStatus {
  return orderStatus === "pending" && paymentStatus === "verified" ? "processing" : orderStatus;
}

/**
 * Where approving the latest `purpose` screenshot would leave the order, for the review dialog's
 * wording: the same recompute `reviewProof` runs. `proofs` are newest first.
 */
export function orderStatusIfApproved(
  order: TimelineOrder & Pick<OrderRow, "paymentStatus">,
  purpose: ProofPurpose,
  deliveryChargeByTransfer: boolean,
): OrderStatus {
  const latest = order.proofs.findIndex((proof) => proof.purpose === purpose);
  const proofs = order.proofs.map((proof, index) => (index === latest ? { ...proof, status: "verified" as const } : proof));
  return statusAfterPaymentReview(order.orderStatus, recomputePaymentStatus({ ...order, proofs }, deliveryChargeByTransfer));
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

/**
 * What the list row's trash icon does, by tab (owner decision, S9 follow-up): a closed order
 * (Cancelled or Rejected) can be permanently deleted — there is nothing left to cancel or reject.
 * An order still open offers the Cancel/Reject chooser as before. Delivery and Completed offer
 * neither (cancel/reject is over, and they're not closed, so nothing to delete): no trash icon.
 */
export type TrashAction = "close" | "delete" | null;

export function trashActionForTab(tab: OrderTab): TrashAction {
  if (tab === "cancelled" || tab === "rejected") return "delete";
  if (tab === "delivery" || tab === "completed") return null;
  return "close";
}
