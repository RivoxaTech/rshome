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

/** A bank order as placed: products screenshot uploaded at checkout, not yet approved. */
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
const noteOf = (input: TimelineOrder, label: string) => buildTimeline(input, paymentProgress(input, BY_TRANSFER)).find((step) => step.label === label)?.note;

/** Approved with a delivery charge of PKR 450, products paid. */
const approved = (overrides: Partial<TimelineOrder> = {}) => order({ orderStatus: "pending", shippingTotal: "450.00", proofs: [verified("goods")], ...overrides });

describe("bank transfer timeline (C20)", () => {
  it("checks the payment first", () => {
    expect(view(order())).toEqual({
      steps: [
        "Order placed:done",
        "Payment checked:current",
        "Approved:upcoming",
        "Delivery charge paid:upcoming",
        "Processing:upcoming",
        "Sent:upcoming",
        "Delivered:upcoming",
      ],
      headline: "Payment being checked",
      upload: null,
      progress: { goods: "submitted", delivery: "awaiting_charge" },
    });
    expect(noteOf(order(), "Payment checked")).toBe("We're checking your payment screenshot.");
  });

  it("shows the reason and reopens the upload when the payment screenshot is rejected", () => {
    const goodsRejected = order({ proofs: [rejected("goods", "Amount does not match")] });
    expect(view(goodsRejected)).toMatchObject({ headline: "Please upload a new payment screenshot", upload: "goods" });
    expect(noteOf(goodsRejected, "Payment checked")).toBe(`${PAYMENT_REJECTED_NOTE} Reason: Amount does not match`);
    // A newer screenshot replaces the rejected one.
    expect(view(order({ proofs: [submitted("goods"), rejected("goods")] }))).toMatchObject({ headline: "Payment being checked", upload: null });
  });

  it("asks for the delivery charge once approved", () => {
    expect(view(approved())).toMatchObject({
      steps: [
        "Order placed:done",
        "Payment checked:done",
        "Approved:done",
        "Delivery charge paid:current",
        "Processing:upcoming",
        "Sent:upcoming",
        "Delivered:upcoming",
      ],
      headline: "Order approved – please pay the delivery charge of PKR 450",
      upload: "delivery",
    });
    expect(noteOf(approved(), "Delivery charge paid")).toBe("Transfer PKR 450 and upload the screenshot.");
  });

  it("checks the delivery charge screenshot, and reopens the upload when it is rejected", () => {
    const underReview = approved({ proofs: [submitted("delivery"), verified("goods")] });
    expect(view(underReview)).toMatchObject({ headline: "Order approved – delivery charge being checked", upload: null });
    expect(noteOf(underReview, "Delivery charge paid")).toBe("Screenshot received. We're checking it.");

    const deliveryRejected = approved({ proofs: [rejected("delivery", "Wrong amount"), verified("goods")] });
    expect(view(deliveryRejected)).toMatchObject({ headline: "Please upload a new delivery charge screenshot", upload: "delivery" });
    expect(noteOf(deliveryRejected, "Delivery charge paid")).toBe(`${PAYMENT_REJECTED_NOTE} Reason: Wrong amount`);
  });

  it("moves through processing, sent and delivered once paid", () => {
    const paid = [verified("delivery"), verified("goods")];
    expect(view(approved({ orderStatus: "processing", proofs: paid }))).toMatchObject({
      headline: "Order approved",
      steps: expect.arrayContaining(["Delivery charge paid:done", "Processing:current", "Sent:upcoming"]),
    });
    const sent = approved({ orderStatus: "shipped", proofs: paid, courier: "TCS", trackingNote: "CN 123456" });
    expect(view(sent).headline).toBe("On its way");
    expect(buildTimeline(sent, paymentProgress(sent, BY_TRANSFER)).find((step) => step.label === "Sent")).toEqual({
      label: "Sent",
      state: "current",
      note: "TCS · CN 123456",
    });
    const delivered = approved({ orderStatus: "delivered", proofs: paid });
    expect(buildTimeline(delivered, paymentProgress(delivered, BY_TRANSFER)).every((step) => step.state === "done")).toBe(true);
    expect(view(delivered).headline).toBe("Delivered");
  });

  it("skips the delivery charge payment for a zero charge, and when it is paid in cash (option B)", () => {
    const free = order({ orderStatus: "processing", shippingTotal: "0.00", proofs: [verified("goods")] });
    expect(view(free).steps).toEqual(["Order placed:done", "Payment checked:done", "Approved:done", "Processing:current", "Sent:upcoming", "Delivered:upcoming"]);
    expect(view(order(), false).steps).not.toContain("Delivery charge paid:upcoming");
  });

  it("takes no uploads once the order is good to go or closed", () => {
    expect(view(approved({ orderStatus: "processing", proofs: [verified("delivery"), verified("goods")] })).upload).toBeNull();
    expect(view(order({ orderStatus: "cancelled", proofs: [rejected("goods")] })).upload).toBeNull();
  });

  it("asks an order placed before S8 without a screenshot for one", () => {
    expect(view(order({ proofs: [] }))).toMatchObject({ headline: "Please upload your payment screenshot", upload: "goods" });
  });
});

describe("cash on delivery timeline (C20)", () => {
  const cod = (overrides: Partial<TimelineOrder> = {}) => order({ paymentMethod: "cod", proofs: [], ...overrides });

  it("has no payment steps and never talks about waiting for the delivery charge", () => {
    expect(view(cod())).toEqual({
      steps: ["Order placed:done", "Approved:current", "Processing:upcoming", "Sent:upcoming", "Delivered:upcoming"],
      headline: "Order received",
      upload: null,
      progress: { goods: "not_due", delivery: "not_due" },
    });
    expect(view(cod({ orderStatus: "processing", shippingTotal: "450.00" }))).toMatchObject({
      steps: ["Order placed:done", "Approved:done", "Processing:current", "Sent:upcoming", "Delivered:upcoming"],
      headline: "Order approved",
    });
  });

  it("shows everything done once delivered", () => {
    const delivered = cod({ orderStatus: "delivered", shippingTotal: "450.00" });
    expect(buildTimeline(delivered, paymentProgress(delivered, BY_TRANSFER)).every((step) => step.state === "done")).toBe(true);
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
