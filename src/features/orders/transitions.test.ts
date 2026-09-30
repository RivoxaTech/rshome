import { describe, expect, it } from "vitest";
import type { OrderStatus, PaymentMethod, PaymentStatus, ProofSummary } from "./status";
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
  canReviewProofs,
  closeRefusal,
  deliveryScreenshotToCheck,
  fulfilmentTargets,
  needsAction,
  orderTab,
  ordersPath,
  planFulfilment,
  recomputePaymentStatus,
  statusActions,
  statusAfterPaymentReview,
  tabsFor,
  type QueueOrder,
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

  it("reviews screenshots only before the order is good to go", () => {
    expect(ORDER_STATUSES.filter(canReviewProofs)).toEqual(["awaiting_shipping_quote", "pending"]);
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

const bankOrder = (orderStatus: OrderStatus, paymentStatus: PaymentStatus): QueueOrder => ({ paymentMethod: "bank_transfer", orderStatus, paymentStatus });
const codOrder = (orderStatus: OrderStatus, paymentStatus: PaymentStatus = "cod_pending"): QueueOrder => ({ paymentMethod: "cod", orderStatus, paymentStatus });

const ALL_PAYMENT_METHODS: PaymentMethod[] = ["bank_transfer", "cod"];

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

  it("flags only a bank order's delivery charge screenshot to check, and counts it with new orders as needing action", () => {
    expect(deliveryScreenshotToCheck(bankOrder("pending", "proof_submitted"))).toBe(true);
    expect(deliveryScreenshotToCheck(bankOrder("pending", "unpaid"))).toBe(false);
    expect(deliveryScreenshotToCheck(bankOrder("awaiting_shipping_quote", "proof_submitted"))).toBe(false);
    expect(deliveryScreenshotToCheck(codOrder("pending", "proof_submitted"))).toBe(false);
    expect(needsAction(bankOrder("awaiting_shipping_quote", "rejected"))).toBe(true);
    expect(needsAction(codOrder("awaiting_shipping_quote"))).toBe(true);
    expect(needsAction(bankOrder("pending", "proof_submitted"))).toBe(true);
    expect(needsAction(bankOrder("pending", "unpaid"))).toBe(false);
    expect(needsAction(codOrder("processing"))).toBe(false);
  });

  it("builds each page's URL with its tab, search and page", () => {
    expect(ordersPath("bank_transfer")).toBe("/panel/orders/bank");
    expect(ordersPath("cod", "need_review")).toBe("/panel/orders/cod?tab=need-review");
    expect(ordersPath("bank_transfer", "pending_delivery", { q: "Ali Khan", page: 2 })).toBe("/panel/orders/bank?tab=pending-delivery&q=Ali+Khan&page=2");
    expect(ordersPath("bank_transfer", "all", { page: 1 })).toBe("/panel/orders/bank");
  });
});

describe("status dropdown steps (C21)", () => {
  it("offers only the next steps an order can take now", () => {
    expect(statusActions(bankOrder("awaiting_shipping_quote", "proof_submitted"), "submitted")).toEqual(["approve", "cancel", "reject"]);
    expect(statusActions(codOrder("awaiting_shipping_quote"), "not_due")).toEqual(["approve", "cancel", "reject"]);
    // Waiting for a new products screenshot, or for the delivery charge: nothing forward.
    expect(statusActions(bankOrder("awaiting_shipping_quote", "rejected"), "rejected")).toEqual(["cancel", "reject"]);
    expect(statusActions(bankOrder("pending", "unpaid"), "verified")).toEqual(["cancel", "reject"]);
    expect(statusActions(bankOrder("pending", "rejected"), "verified")).toEqual(["cancel", "reject"]);
    expect(statusActions(bankOrder("pending", "proof_submitted"), "verified")).toEqual(["check_delivery", "cancel", "reject"]);
    expect(statusActions(codOrder("processing"), "not_due")).toEqual(["ship", "complete", "cancel", "reject"]);
    expect(statusActions(bankOrder("confirmed", "verified"), "verified")).toEqual(["ship", "complete", "cancel", "reject"]);
    // Out for delivery: only Completed; no cancel or reject any more.
    expect(statusActions(codOrder("shipped"), "not_due")).toEqual(["complete"]);
    for (const closed of ["delivered", "cancelled", "rejected"] as const) {
      expect(statusActions(codOrder(closed), "not_due")).toEqual([]);
    }
  });

  it("names each step by the tab it leads to", () => {
    expect(actionTarget("approve", "bank_transfer", true)).toBe("pending_delivery");
    expect(actionTarget("approve", "bank_transfer", false)).toBe("processing");
    expect(actionTarget("approve", "cod", true)).toBe("processing");
    expect(actionTarget("check_delivery", "bank_transfer", true)).toBe("processing");
    expect(actionTarget("ship", "cod", true)).toBe("delivery");
    expect(actionTarget("complete", "cod", true)).toBe("completed");
    expect(actionTarget("cancel", "cod", true)).toBe("cancelled");
    expect(actionTarget("reject", "cod", true)).toBe("rejected");
  });

  it("never offers an earlier status, for any combination", () => {
    const rank = (tab: string) => ORDER_TABS.indexOf(tab as (typeof ORDER_TABS)[number]);
    for (const paymentMethod of ALL_PAYMENT_METHODS) {
      for (const orderStatus of ORDER_STATUSES) {
        for (const paymentStatus of PAYMENT_STATUSES) {
          const order = { paymentMethod, orderStatus, paymentStatus };
          for (const goods of ["missing", "submitted", "verified", "rejected", "not_due"] as const) {
            for (const action of statusActions(order, goods)) {
              expect(rank(actionTarget(action, paymentMethod, true)), `${paymentMethod}/${orderStatus}/${paymentStatus}: ${action}`).toBeGreaterThan(
                rank(orderTab(order)),
              );
            }
          }
        }
      }
    }
  });
});

describe("approve order", () => {
  it("needs a new order, and for bank transfer a products screenshot to approve", () => {
    expect(approvalRefusal(bankOrder("awaiting_shipping_quote", "proof_submitted"), "submitted")).toBeNull();
    expect(approvalRefusal(bankOrder("awaiting_shipping_quote", "verified"), "verified")).toBeNull();
    expect(approvalRefusal(codOrder("awaiting_shipping_quote"), "not_due")).toBeNull();
    for (const goods of ["rejected", "missing"] as const) {
      expect(approvalRefusal(bankOrder("awaiting_shipping_quote", "rejected"), goods)).toBe("Waiting for a new payment screenshot from the customer.");
    }
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

  it("makes the order good to go once the delivery charge screenshot is approved, not before", () => {
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
