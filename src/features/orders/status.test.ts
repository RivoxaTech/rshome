import { describe, expect, it } from "vitest";
import {
  PAYMENT_REJECTED_NOTE,
  buildTimeline,
  paymentProgress,
  statusHeadline,
  uploadPurpose,
  type ProofSummary,
  type TimelineOrder,
} from "./status";

const submitted = (purpose: ProofSummary["purpose"]): ProofSummary => ({ purpose, status: "submitted", rejectionReason: null });
const verified = (purpose: ProofSummary["purpose"]): ProofSummary => ({ purpose, status: "verified", rejectionReason: null });
const rejected = (purpose: ProofSummary["purpose"], reason: string | null = null): ProofSummary => ({
  purpose,
  status: "rejected",
  rejectionReason: reason,
});

/** A bank order as placed today: goods screenshot uploaded at checkout, delivery charge not yet quoted. */
function order(overrides: Partial<TimelineOrder> = {}): TimelineOrder {
  return {
    orderStatus: "awaiting_shipping_quote",
    paymentMethod: "bank_transfer",
    rejectionReason: null,
    courier: null,
    trackingNote: null,
    shippingTotal: null,
    proofs: [submitted("goods")],
    ...overrides,
  };
}

/** Option A (owner decision, S8): the delivery charge is paid by a second transfer. */
const BY_TRANSFER = true;

const view = (input: TimelineOrder, byTransfer = BY_TRANSFER) => {
  const progress = paymentProgress(input, byTransfer);
  return {
    steps: buildTimeline(input, progress).map((step) => `${step.label}:${step.state}`),
    headline: statusHeadline(input, progress),
    upload: uploadPurpose(input, progress),
    progress,
  };
};

describe("bank transfer timeline", () => {
  it("reviews the checkout screenshot while the delivery charge is awaited", () => {
    expect(view(order())).toEqual({
      steps: [
        "Payment under review:current",
        "Waiting for delivery charge:current",
        "Delivery charge payment:upcoming",
        "Confirmed:upcoming",
        "Being prepared:upcoming",
        "Shipped:upcoming",
        "Delivered:upcoming",
      ],
      headline: "Waiting for delivery charge",
      upload: null,
      progress: { goods: "submitted", delivery: "awaiting_charge" },
    });
  });

  it("marks the goods payment done once verified, still before the charge is set", () => {
    const result = view(order({ proofs: [verified("goods")] }));
    expect(result.steps.slice(0, 3)).toEqual([
      "Payment under review:done",
      "Waiting for delivery charge:current",
      "Delivery charge payment:upcoming",
    ]);
    expect(result.upload).toBeNull();
  });

  it("asks for the delivery charge screenshot once the charge is set", () => {
    const quoted = order({ orderStatus: "pending", shippingTotal: "450.00", proofs: [verified("goods")] });
    const result = view(quoted);
    expect(result.steps.slice(0, 3)).toEqual(["Payment under review:done", "Waiting for delivery charge:done", "Delivery charge payment:current"]);
    expect(result.headline).toBe("Awaiting payment");
    expect(result.upload).toBe("delivery");
  });

  it("puts the delivery screenshot under review, then waits for confirmation", () => {
    const underReview = order({ orderStatus: "pending", shippingTotal: "450.00", proofs: [submitted("delivery"), verified("goods")] });
    expect(view(underReview)).toMatchObject({ headline: "Payment under review", upload: null });
    expect(buildTimeline(underReview, paymentProgress(underReview, BY_TRANSFER))[2]).toEqual({
      label: "Delivery charge payment",
      state: "current",
      note: "Screenshot received. We're checking it.",
    });

    const paid = order({ orderStatus: "pending", shippingTotal: "450.00", proofs: [verified("delivery"), verified("goods")] });
    expect(view(paid)).toMatchObject({ headline: "Waiting for confirmation", upload: null });
    expect(view(paid).steps.slice(2, 4)).toEqual(["Delivery charge payment:done", "Confirmed:upcoming"]);
  });

  it("shows the reason and reopens the upload when a screenshot is rejected", () => {
    const goodsRejected = order({ proofs: [rejected("goods", "Amount does not match")] });
    expect(buildTimeline(goodsRejected, paymentProgress(goodsRejected, BY_TRANSFER))[0]).toEqual({
      label: "Awaiting payment",
      state: "current",
      note: `${PAYMENT_REJECTED_NOTE} Reason: Amount does not match`,
    });
    expect(view(goodsRejected)).toMatchObject({ headline: "Awaiting payment", upload: "goods" });

    // A newer screenshot replaces the rejected one.
    expect(view(order({ proofs: [submitted("goods"), rejected("goods")] })).upload).toBeNull();

    const deliveryRejected = order({ orderStatus: "pending", shippingTotal: "450.00", proofs: [rejected("delivery"), verified("goods")] });
    expect(buildTimeline(deliveryRejected, paymentProgress(deliveryRejected, BY_TRANSFER))[2].note).toBe(PAYMENT_REJECTED_NOTE);
    expect(view(deliveryRejected).upload).toBe("delivery");
  });

  it("asks for the goods screenshot first when both payments need one", () => {
    const both = order({ orderStatus: "pending", shippingTotal: "450.00", proofs: [rejected("goods")] });
    expect(view(both).upload).toBe("goods");
  });

  it("needs no delivery payment for a zero delivery charge", () => {
    const free = order({ orderStatus: "pending", shippingTotal: "0.00", proofs: [verified("goods")] });
    expect(view(free)).toMatchObject({ headline: "Waiting for confirmation", upload: null, progress: { delivery: "not_due" } });
    expect(view(free).steps).not.toContain("Delivery charge payment:current");
  });

  it("drops the delivery payment step when the charge is paid in cash on delivery (option B)", () => {
    const quoted = order({ orderStatus: "pending", shippingTotal: "450.00", proofs: [verified("goods")] });
    expect(view(quoted, false)).toMatchObject({
      steps: ["Payment under review:done", "Waiting for delivery charge:done", "Confirmed:upcoming", "Being prepared:upcoming", "Shipped:upcoming", "Delivered:upcoming"],
      headline: "Waiting for confirmation",
      upload: null,
    });
  });

  it("takes no uploads once the order is confirmed or closed", () => {
    const confirmed = order({ orderStatus: "confirmed", shippingTotal: "450.00", proofs: [verified("delivery"), verified("goods")] });
    expect(view(confirmed).steps.slice(0, 4)).toEqual([
      "Payment under review:done",
      "Waiting for delivery charge:done",
      "Delivery charge payment:done",
      "Confirmed:current",
    ]);
    expect(view(order({ orderStatus: "cancelled", proofs: [rejected("goods")] })).upload).toBeNull();
  });

  it("treats an order placed before S8 without a screenshot as awaiting payment", () => {
    expect(view(order({ proofs: [] }))).toMatchObject({ headline: "Awaiting payment", upload: "goods" });
  });
});

describe("cash on delivery timeline", () => {
  const cod = (overrides: Partial<TimelineOrder> = {}) => order({ paymentMethod: "cod", proofs: [], ...overrides });

  it("has no payment steps", () => {
    expect(view(cod({ orderStatus: "pending", shippingTotal: "450.00" }))).toEqual({
      steps: ["Waiting for delivery charge:done", "Confirmed:upcoming", "Being prepared:upcoming", "Shipped:upcoming", "Delivered:upcoming"],
      headline: "Waiting for confirmation",
      upload: null,
      progress: { goods: "not_due", delivery: "not_due" },
    });
    expect(view(cod()).headline).toBe("Waiting for delivery charge");
  });

  it("marks confirmed, prepared and shipped as the order moves, with the courier note", () => {
    expect(view(cod({ orderStatus: "confirmed" })).steps.slice(1)).toEqual([
      "Confirmed:current",
      "Being prepared:upcoming",
      "Shipped:upcoming",
      "Delivered:upcoming",
    ]);
    expect(view(cod({ orderStatus: "processing" })).headline).toBe("Being prepared");

    const shipped = cod({ orderStatus: "shipped", courier: "TCS", trackingNote: "CN 123456" });
    const shippedStep = buildTimeline(shipped, paymentProgress(shipped, BY_TRANSFER)).find((step) => step.label === "Shipped");
    expect(shippedStep).toEqual({ label: "Shipped", state: "current", note: "TCS · CN 123456" });
  });

  it("shows everything done once delivered", () => {
    const delivered = cod({ orderStatus: "delivered" });
    expect(buildTimeline(delivered, paymentProgress(delivered, BY_TRANSFER)).every((step) => step.state === "done")).toBe(true);
    expect(view(delivered).headline).toBe("Delivered");
  });
});

describe("closed orders", () => {
  it("replaces the path with the outcome and reason", () => {
    const rejectedOrder = order({ orderStatus: "rejected", rejectionReason: "Out of stock" });
    expect(buildTimeline(rejectedOrder, paymentProgress(rejectedOrder, BY_TRANSFER))).toEqual([
      { label: "Order placed", state: "done", note: null },
      { label: "Rejected", state: "current", note: "Out of stock" },
    ]);
    const cancelled = order({ orderStatus: "cancelled" });
    expect(buildTimeline(cancelled, paymentProgress(cancelled, BY_TRANSFER))[1]).toEqual({ label: "Cancelled", state: "current", note: null });
  });
});
