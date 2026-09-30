import { describe, expect, it } from "vitest";
import { latestProofStates, type LatestProofs, type OrderStatus, type PaymentMethod, type PaymentStatus, type ProofState, type ProofSummary } from "./status";
import {
  ORDER_STATUS_LABELS,
  ORDER_TABS,
  PAYMENT_STATUS_LABELS,
  actionTarget,
  approvalRefusal,
  approvedStatus,
  canClose,
  canMoveOrder,
  canMovePayment,
  canReviewProof,
  closeRefusal,
  fulfilmentTargets,
  needsAction,
  orderStatusIfApproved,
  orderTab,
  ordersPath,
  planFulfilment,
  recomputePaymentStatus,
  screenshotToCheck,
  screenshotsToCheck,
  statusActions,
  statusAfterPaymentReview,
  tabsFor,
  trashActionForTab,
  type FlagOrder,
} from "./transitions";

const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];
const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];

describe("order status transitions", () => {
  const allowed = [
    // Approve order: to "Delivery charge unpaid" (bank, charge due) or straight to "Good to go".
    "awaiting_shipping_quote→pending",
    "awaiting_shipping_quote→processing",
    "awaiting_shipping_quote→rejected",
    "awaiting_shipping_quote→cancelled",
    // Delivery charge screenshot approved.
    "pending→processing",
    "pending→rejected",
    "pending→cancelled",
    // `confirmed` is no longer entered; an order there counts as good to go.
    "confirmed→shipped",
    "confirmed→delivered",
    "confirmed→rejected",
    "confirmed→cancelled",
    // Fulfilment, forward only (Sent may be skipped).
    "processing→shipped",
    "processing→delivered",
    "processing→rejected",
    "processing→cancelled",
    "shipped→delivered",
  ];

  it("allows exactly the listed moves and forbids every other pair", () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        expect(canMoveOrder(from, to), `${from}→${to}`).toBe(allowed.includes(`${from}→${to}`));
      }
    }
  });

  it("never goes back, never leaves a closed state, and never closes an order once sent", () => {
    expect(canMoveOrder("shipped", "processing")).toBe(false);
    expect(canMoveOrder("delivered", "shipped")).toBe(false);
    for (const closed of ["delivered", "cancelled", "rejected"] as const) {
      expect(ORDER_STATUSES.some((to) => canMoveOrder(closed, to))).toBe(false);
    }
    expect(ORDER_STATUSES.filter(canClose)).toEqual(["awaiting_shipping_quote", "pending", "confirmed", "processing"]);
  });

  it("lets a waiting screenshot be checked in any open state, never on a closed order", () => {
    expect(ORDER_STATUSES.filter(canReviewProof)).toEqual(["awaiting_shipping_quote", "pending", "confirmed", "processing", "shipped", "delivered"]);
  });
});

describe("payment status transitions", () => {
  const allowed = [
    "unpaid→proof_submitted",
    "rejected→proof_submitted",
    "proof_submitted→verified",
    "proof_submitted→rejected",
    "proof_submitted→unpaid",
    "verified→unpaid",
    "cod_pending→cod_collected",
  ];

  it("allows exactly the listed moves and forbids every other pair", () => {
    for (const from of PAYMENT_STATUSES) {
      for (const to of PAYMENT_STATUSES) {
        expect(canMovePayment(from, to), `${from}→${to}`).toBe(allowed.includes(`${from}→${to}`));
      }
    }
  });
});

const NO_PROOFS: LatestProofs = { goods: "missing", delivery: "missing" };
const bankOrder = (orderStatus: OrderStatus, paymentStatus: PaymentStatus, latest: Partial<LatestProofs> = {}): FlagOrder => ({
  paymentMethod: "bank_transfer",
  orderStatus,
  paymentStatus,
  latest: { ...NO_PROOFS, ...latest },
});
const codOrder = (orderStatus: OrderStatus, paymentStatus: PaymentStatus = "cod_pending"): FlagOrder => ({
  paymentMethod: "cod",
  orderStatus,
  paymentStatus,
  latest: NO_PROOFS,
});

const ALL_PAYMENT_METHODS: PaymentMethod[] = ["bank_transfer", "cod"];
const PROOF_STATES: ProofState[] = ["missing", "submitted", "verified", "rejected"];
/** Every pair of latest screenshot states (products, delivery charge). */
const ALL_LATEST: LatestProofs[] = PROOF_STATES.flatMap((goods) => PROOF_STATES.map((delivery) => ({ goods, delivery })));

describe("order tabs (C21)", () => {
  it("puts every combination of order status and payment status in exactly one of its method's tabs", () => {
    for (const paymentMethod of ALL_PAYMENT_METHODS) {
      for (const orderStatus of ORDER_STATUSES) {
        for (const paymentStatus of PAYMENT_STATUSES) {
          const tab = orderTab({ paymentMethod, orderStatus, paymentStatus });
          expect(tabsFor(paymentMethod), `${paymentMethod}/${orderStatus}/${paymentStatus}`).toContain(tab);
        }
      }
    }
  });

  it("gives bank transfer every tab and cash on delivery all but Pending delivery charge", () => {
    expect(tabsFor("bank_transfer")).toEqual(["need_review", "pending_delivery", "processing", "delivery", "completed", "cancelled", "rejected"]);
    expect(tabsFor("cod")).toEqual(["need_review", "processing", "delivery", "completed", "cancelled", "rejected"]);
  });

  it("maps the statuses as the owner described", () => {
    for (const paymentStatus of PAYMENT_STATUSES) {
      expect(orderTab(bankOrder("awaiting_shipping_quote", paymentStatus))).toBe("need_review");
      expect(orderTab(codOrder("awaiting_shipping_quote", paymentStatus))).toBe("need_review");
      expect(orderTab(bankOrder("pending", paymentStatus))).toBe("pending_delivery");
      for (const method of [bankOrder, codOrder]) {
        expect(orderTab(method("processing", paymentStatus))).toBe("processing");
        expect(orderTab(method("confirmed", paymentStatus))).toBe("processing");
        expect(orderTab(method("shipped", paymentStatus))).toBe("delivery");
        expect(orderTab(method("delivered", paymentStatus))).toBe("completed");
        expect(orderTab(method("cancelled", paymentStatus))).toBe("cancelled");
        expect(orderTab(method("rejected", paymentStatus))).toBe("rejected");
      }
    }
    // The flow never leaves a COD order in `pending`; one left there by hand needs a look.
    expect(orderTab(codOrder("pending"))).toBe("need_review");
  });

  it("flags a screenshot to check from each payment's latest screenshot, not from payment_status (C22)", () => {
    // Past Need review, whichever payment is waiting: products first, then delivery charge.
    expect(screenshotsToCheck(bankOrder("pending", "proof_submitted", { goods: "verified", delivery: "submitted" }))).toEqual(["delivery"]);
    expect(screenshotsToCheck(bankOrder("pending", "proof_submitted", { goods: "submitted", delivery: "verified" }))).toEqual(["goods"]);
    expect(screenshotsToCheck(bankOrder("pending", "proof_submitted", { goods: "submitted", delivery: "submitted" }))).toEqual(["goods", "delivery"]);
    // Whatever payment_status says, and in any open tab.
    expect(screenshotToCheck(bankOrder("pending", "unpaid", { goods: "verified", delivery: "submitted" }))).toBe(true);
    expect(screenshotToCheck(bankOrder("processing", "verified", { goods: "submitted", delivery: "verified" }))).toBe(true);
    expect(screenshotToCheck(bankOrder("pending", "proof_submitted", { goods: "verified", delivery: "missing" }))).toBe(false);
    // In Need review the products screenshot is the order review itself; closed orders and COD never.
    expect(screenshotToCheck(bankOrder("awaiting_shipping_quote", "proof_submitted", { goods: "submitted" }))).toBe(false);
    expect(screenshotToCheck(bankOrder("cancelled", "proof_submitted", { goods: "verified", delivery: "submitted" }))).toBe(false);
    expect(screenshotToCheck(codOrder("pending", "proof_submitted"))).toBe(false);
  });

  it("reads the latest screenshot per payment, newest first", () => {
    const proofs = [proof("goods", "submitted"), proof("delivery", "verified"), proof("goods", "rejected"), proof("delivery", "submitted")];
    expect(latestProofStates(proofs)).toEqual({ goods: "submitted", delivery: "verified" });
    expect(latestProofStates([proof("goods", "verified")])).toEqual({ goods: "verified", delivery: "missing" });
    expect(latestProofStates([])).toEqual(NO_PROOFS);
  });

  it("counts as needing action an order staff can approve, or a screenshot to check, never one waiting for the customer", () => {
    expect(needsAction(bankOrder("awaiting_shipping_quote", "proof_submitted", { goods: "submitted" }))).toBe(true);
    expect(needsAction(codOrder("awaiting_shipping_quote"))).toBe(true);
    expect(needsAction(bankOrder("awaiting_shipping_quote", "unpaid"))).toBe(false);
    expect(needsAction(bankOrder("awaiting_shipping_quote", "rejected", { goods: "rejected" }))).toBe(false);
    expect(needsAction(bankOrder("pending", "proof_submitted", { goods: "verified", delivery: "submitted" }))).toBe(true);
    expect(needsAction(bankOrder("pending", "unpaid", { goods: "verified" }))).toBe(false);
    expect(needsAction(codOrder("processing"))).toBe(false);
  });

  it("builds each page's URL with its tab, search and page", () => {
    expect(ordersPath("bank_transfer")).toBe("/panel/orders/bank");
    expect(ordersPath("cod", "need_review")).toBe("/panel/orders/cod?tab=need-review");
    expect(ordersPath("bank_transfer", "pending_delivery", { q: "Ali Khan", page: 2 })).toBe("/panel/orders/bank?tab=pending-delivery&q=Ali+Khan&page=2");
    expect(ordersPath("bank_transfer", "all", { page: 1 })).toBe("/panel/orders/bank");
  });
});

describe("status menu steps (C21, C22)", () => {
  it("offers only the next steps an order can take now", () => {
    expect(statusActions(bankOrder("awaiting_shipping_quote", "proof_submitted", { goods: "submitted" }))).toEqual(["approve", "cancel", "reject"]);
    expect(statusActions(codOrder("awaiting_shipping_quote"))).toEqual(["approve", "cancel", "reject"]);
    // No products screenshot yet, or waiting for a new one: only cancel and reject.
    expect(statusActions(bankOrder("awaiting_shipping_quote", "unpaid"))).toEqual(["cancel", "reject"]);
    expect(statusActions(bankOrder("awaiting_shipping_quote", "rejected", { goods: "rejected" }))).toEqual(["cancel", "reject"]);
    // Waiting for the delivery charge: nothing forward.
    expect(statusActions(bankOrder("pending", "unpaid", { goods: "verified" }))).toEqual(["cancel", "reject"]);
    expect(statusActions(bankOrder("pending", "rejected", { goods: "verified", delivery: "rejected" }))).toEqual(["cancel", "reject"]);
    // A screenshot waiting with both payments in: check it, on to Processing (products or delivery charge).
    expect(statusActions(bankOrder("pending", "proof_submitted", { goods: "verified", delivery: "submitted" }))).toEqual(["check_screenshot", "cancel", "reject"]);
    expect(statusActions(bankOrder("pending", "proof_submitted", { goods: "submitted", delivery: "verified" }))).toEqual(["check_screenshot", "cancel", "reject"]);
    // Approving the products alone can't reach Processing while the delivery charge is missing.
    expect(statusActions(bankOrder("pending", "proof_submitted", { goods: "submitted" }))).toEqual(["cancel", "reject"]);
    expect(statusActions(codOrder("processing"))).toEqual(["ship", "complete", "cancel", "reject"]);
    expect(statusActions(bankOrder("confirmed", "verified", { goods: "verified" }))).toEqual(["ship", "complete", "cancel", "reject"]);
    // Out for delivery: only Completed; no cancel or reject any more.
    expect(statusActions(codOrder("shipped"))).toEqual(["complete"]);
    for (const closed of ["delivered", "cancelled", "rejected"] as const) {
      expect(statusActions(codOrder(closed))).toEqual([]);
    }
  });

  it("names each step by the tab it leads to", () => {
    expect(actionTarget("approve", "bank_transfer", true)).toBe("pending_delivery");
    expect(actionTarget("approve", "bank_transfer", false)).toBe("processing");
    expect(actionTarget("approve", "cod", true)).toBe("processing");
    expect(actionTarget("check_screenshot", "bank_transfer", true)).toBe("processing");
    expect(actionTarget("ship", "cod", true)).toBe("delivery");
    expect(actionTarget("complete", "cod", true)).toBe("completed");
    expect(actionTarget("cancel", "cod", true)).toBe("cancelled");
    expect(actionTarget("reject", "cod", true)).toBe("rejected");
  });

  it("never offers the current or an earlier status, for any combination", () => {
    const rank = (tab: string) => ORDER_TABS.indexOf(tab as (typeof ORDER_TABS)[number]);
    for (const paymentMethod of ALL_PAYMENT_METHODS) {
      for (const orderStatus of ORDER_STATUSES) {
        for (const paymentStatus of PAYMENT_STATUSES) {
          for (const latest of ALL_LATEST) {
            const order: FlagOrder = { paymentMethod, orderStatus, paymentStatus, latest };
            for (const byTransfer of [true, false]) {
              const targets = statusActions(order).map((action) => actionTarget(action, paymentMethod, byTransfer));
              const where = `${paymentMethod}/${orderStatus}/${paymentStatus}/${latest.goods}+${latest.delivery}`;
              expect(targets, where).not.toContain(orderTab(order));
              for (const target of targets) expect(rank(target), where).toBeGreaterThan(rank(orderTab(order)));
              expect(new Set(targets).size, `${where}: one row per status`).toBe(targets.length);
            }
          }
        }
      }
    }
  });

  it("never approves a bank order without a products screenshot", () => {
    for (const paymentStatus of PAYMENT_STATUSES) {
      for (const delivery of PROOF_STATES) {
        expect(statusActions(bankOrder("awaiting_shipping_quote", paymentStatus, { goods: "missing", delivery }))).not.toContain("approve");
      }
    }
  });
});

describe("the screenshot a review dialog shows, and what approving it does (C22)", () => {
  const order = (orderStatus: OrderStatus, proofs: ProofSummary[], shippingTotal: string | null = "450.00") => ({
    ...paidOrder({ shippingTotal, proofs }),
    orderStatus,
    paymentStatus: "proof_submitted" as const,
  });

  it("moves Pending delivery charge to Processing when this approval completes both payments", () => {
    expect(orderStatusIfApproved(order("pending", [proof("delivery", "submitted"), proof("goods", "verified")]), "delivery", true)).toBe("processing");
    expect(orderStatusIfApproved(order("pending", [proof("goods", "submitted"), proof("delivery", "verified")]), "goods", true)).toBe("processing");
  });

  it("keeps the order where it is while another payment is still missing or waiting", () => {
    expect(orderStatusIfApproved(order("pending", [proof("goods", "submitted")]), "goods", true)).toBe("pending");
    expect(orderStatusIfApproved(order("pending", [proof("delivery", "submitted"), proof("goods", "submitted")]), "goods", true)).toBe("pending");
    expect(orderStatusIfApproved(order("processing", [proof("goods", "submitted")], "0.00"), "goods", true)).toBe("processing");
  });

  it("approves only the latest screenshot of that payment", () => {
    const stale = order("pending", [proof("delivery", "submitted"), proof("goods", "submitted"), proof("goods", "rejected")]);
    expect(orderStatusIfApproved(stale, "delivery", true)).toBe("pending");
  });
});

describe("approve order", () => {
  it("needs a new order, and for bank transfer a products screenshot to approve", () => {
    expect(approvalRefusal(bankOrder("awaiting_shipping_quote", "proof_submitted"), "submitted")).toBeNull();
    expect(approvalRefusal(bankOrder("awaiting_shipping_quote", "verified"), "verified")).toBeNull();
    expect(approvalRefusal(codOrder("awaiting_shipping_quote"), "not_due")).toBeNull();
    expect(approvalRefusal(bankOrder("awaiting_shipping_quote", "rejected"), "rejected")).toBe("The customer hasn't uploaded a payment screenshot yet.");
    expect(approvalRefusal(bankOrder("awaiting_shipping_quote", "unpaid"), "missing")).toBe("The customer hasn't uploaded a payment screenshot yet.");
    expect(approvalRefusal(bankOrder("pending", "unpaid"), "verified")).toBe("This order is already approved.");
    expect(approvalRefusal(codOrder("cancelled"), "not_due")).toBe("This order is closed.");
  });

  it("waits for the delivery charge on a bank order, and skips it for a zero charge, option B, and COD", () => {
    expect(approvedStatus("bank_transfer", 45000, true)).toBe("pending");
    expect(approvedStatus("bank_transfer", 0, true)).toBe("processing");
    expect(approvedStatus("bank_transfer", 45000, false)).toBe("processing");
    expect(approvedStatus("cod", 45000, true)).toBe("processing");
    expect(approvedStatus("cod", 0, true)).toBe("processing");
  });

  it("makes the order good to go once every due payment is approved, not before", () => {
    expect(statusAfterPaymentReview("pending", "verified")).toBe("processing");
    expect(statusAfterPaymentReview("pending", "rejected")).toBe("pending");
    expect(statusAfterPaymentReview("awaiting_shipping_quote", "rejected")).toBe("awaiting_shipping_quote");
  });
});

describe("fulfilment: Delivery and Completed", () => {
  it("moves only forward from Processing or Delivery (Delivery may be skipped)", () => {
    expect(ORDER_STATUSES.map((status) => [status, fulfilmentTargets(status)])).toEqual([
      ["awaiting_shipping_quote", []],
      ["pending", []],
      ["confirmed", ["shipped", "delivered"]],
      ["processing", ["shipped", "delivered"]],
      ["shipped", ["delivered"]],
      ["delivered", []],
      ["cancelled", []],
      ["rejected", []],
    ]);
  });

  it("records the cash as collected when a COD order is delivered, and leaves a bank order's payment alone", () => {
    expect(planFulfilment(codOrder("shipped"), "delivered")).toEqual({ ok: true, orderStatus: "delivered", paymentStatus: "cod_collected" });
    expect(planFulfilment(codOrder("processing"), "shipped")).toEqual({ ok: true, orderStatus: "shipped", paymentStatus: "cod_pending" });
    expect(planFulfilment(bankOrder("processing", "verified"), "delivered")).toEqual({ ok: true, orderStatus: "delivered", paymentStatus: "verified" });
  });

  it("refuses a backward move or one before approval", () => {
    expect(planFulfilment(codOrder("delivered", "cod_collected"), "shipped")).toEqual({ ok: false, error: "This order can't be marked sent now." });
    expect(planFulfilment(codOrder("awaiting_shipping_quote"), "shipped").ok).toBe(false);
    expect(planFulfilment(bankOrder("pending", "unpaid"), "delivered").ok).toBe(false);
  });
});

describe("reject or cancel the order", () => {
  it("is allowed until the order is sent, with a reason", () => {
    for (const status of ["awaiting_shipping_quote", "pending", "confirmed", "processing"] as const) {
      expect(closeRefusal(status, "reject", "Out of stock")).toBeNull();
      expect(closeRefusal(status, "cancel", "Customer asked")).toBeNull();
      expect(closeRefusal(status, "cancel", "  ")).toBe("Enter a reason.");
    }
    expect(closeRefusal("shipped", "cancel", "Too late")).toBe("An order that has been sent can't be cancelled.");
    expect(closeRefusal("delivered", "reject", "Too late")).toBe("An order that has been delivered can't be rejected.");
  });

  it("happens once: a closed order can't be closed again", () => {
    expect(closeRefusal("cancelled", "reject", "Again")).toBe("This order is already closed.");
    expect(closeRefusal("rejected", "cancel", "Again")).toBe("This order is already closed.");
  });
});

describe("the trash icon's action, by tab (S9 follow-up)", () => {
  it("deletes once closed, offers cancel/reject while open, and nothing once out for delivery", () => {
    expect(trashActionForTab("cancelled")).toBe("delete");
    expect(trashActionForTab("rejected")).toBe("delete");
    expect(trashActionForTab("need_review")).toBe("close");
    expect(trashActionForTab("pending_delivery")).toBe("close");
    expect(trashActionForTab("processing")).toBe("close");
    expect(trashActionForTab("delivery")).toBeNull();
    expect(trashActionForTab("completed")).toBeNull();
  });

  it("covers every tab", () => {
    for (const tab of ORDER_TABS) expect(["close", "delete", null]).toContain(trashActionForTab(tab));
  });
});

const proof = (purpose: ProofSummary["purpose"], status: ProofSummary["status"]): ProofSummary => ({ purpose, status, rejectionReason: null });

/** A bank order as placed: products screenshot under review, delivery charge not set. */
function paidOrder(overrides: { shippingTotal?: string | null; proofs?: ProofSummary[] } = {}) {
  return {
    orderStatus: "awaiting_shipping_quote" as const,
    paymentMethod: "bank_transfer" as const,
    paymentStatus: "proof_submitted" as const,
    rejectionReason: null,
    courier: null,
    trackingNote: null,
    shippingTotal: null,
    proofs: [proof("goods", "submitted")],
    ...overrides,
  };
}

describe("recomputePaymentStatus", () => {
  const recompute = (overrides: Parameters<typeof paidOrder>[0], byTransfer = true) => recomputePaymentStatus(paidOrder(overrides), byTransfer);

  it("follows the products screenshot while the delivery charge is not set", () => {
    expect(recompute({})).toBe("proof_submitted");
    expect(recompute({ proofs: [proof("goods", "verified")] })).toBe("verified");
    expect(recompute({ proofs: [proof("goods", "rejected")] })).toBe("rejected");
    expect(recompute({ proofs: [] })).toBe("unpaid");
  });

  it("is unpaid right after approval sets a charge, unless a delivery screenshot is already in", () => {
    expect(recompute({ shippingTotal: "450.00", proofs: [proof("goods", "verified")] })).toBe("unpaid");
    expect(recompute({ shippingTotal: "450.00", proofs: [proof("delivery", "submitted"), proof("goods", "verified")] })).toBe("proof_submitted");
  });

  it("is rejected when a due screenshot was rejected and nothing awaits review", () => {
    expect(recompute({ shippingTotal: "450.00", proofs: [proof("delivery", "rejected"), proof("goods", "verified")] })).toBe("rejected");
  });

  it("is verified only when both screenshots are approved, or the charge needs none", () => {
    expect(recompute({ shippingTotal: "450.00", proofs: [proof("delivery", "verified"), proof("goods", "verified")] })).toBe("verified");
    expect(
      recompute({ shippingTotal: "450.00", proofs: [proof("delivery", "verified"), proof("goods", "verified"), proof("goods", "rejected")] }),
    ).toBe("verified");
    expect(recompute({ shippingTotal: "0.00", proofs: [proof("goods", "verified")] })).toBe("verified");
    expect(recompute({ shippingTotal: "450.00", proofs: [proof("goods", "verified")] }, false)).toBe("verified");
  });

  it("leaves a COD order's payment status alone", () => {
    const cod = { ...paidOrder({ shippingTotal: "450.00", proofs: [] }), paymentMethod: "cod" as const, paymentStatus: "cod_pending" as const };
    expect(recomputePaymentStatus(cod, true)).toBe("cod_pending");
  });
});
