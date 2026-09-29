import { describe, expect, it } from "vitest";
import { PAYMENT_REJECTED_NOTE, buildTimeline, statusHeadline, type TimelineOrder } from "./status";

function order(overrides: Partial<TimelineOrder> = {}): TimelineOrder {
  return {
    orderStatus: "awaiting_shipping_quote",
    paymentStatus: "unpaid",
    paymentMethod: "bank_transfer",
    rejectionReason: null,
    courier: null,
    trackingNote: null,
    ...overrides,
  };
}

const states = (input: TimelineOrder) => buildTimeline(input).map((step) => `${step.label}:${step.state}`);

describe("buildTimeline", () => {
  it("starts a bank order at the delivery charge with both payment steps ahead", () => {
    expect(states(order())).toEqual([
      "Waiting for delivery charge:current",
      "Awaiting payment:upcoming",
      "Payment under review:upcoming",
      "Confirmed:upcoming",
      "Being prepared:upcoming",
      "Shipped:upcoming",
      "Delivered:upcoming",
    ]);
    expect(statusHeadline(order())).toBe("Waiting for delivery charge");
  });

  it("moves a quoted bank order to awaiting payment, then under review, then waiting for confirmation", () => {
    const quoted = order({ orderStatus: "pending" });
    expect(states(quoted).slice(0, 3)).toEqual(["Waiting for delivery charge:done", "Awaiting payment:current", "Payment under review:upcoming"]);
    expect(statusHeadline(quoted)).toBe("Awaiting payment");

    const submitted = order({ orderStatus: "pending", paymentStatus: "proof_submitted" });
    expect(states(submitted).slice(1, 3)).toEqual(["Awaiting payment:done", "Payment under review:current"]);
    expect(statusHeadline(submitted)).toBe("Payment under review");

    const verified = order({ orderStatus: "pending", paymentStatus: "verified" });
    expect(states(verified).slice(1, 4)).toEqual(["Awaiting payment:done", "Payment under review:done", "Confirmed:upcoming"]);
    expect(statusHeadline(verified)).toBe("Waiting for confirmation");
  });

  it("explains a rejected payment on the awaiting-payment step", () => {
    const step = buildTimeline(order({ orderStatus: "pending", paymentStatus: "rejected" }))[1];
    expect(step).toEqual({ label: "Awaiting payment", state: "current", note: PAYMENT_REJECTED_NOTE });
  });

  it("has no payment steps for cash on delivery", () => {
    const cod = order({ orderStatus: "pending", paymentMethod: "cod", paymentStatus: "cod_pending" });
    expect(states(cod)).toEqual([
      "Waiting for delivery charge:done",
      "Confirmed:upcoming",
      "Being prepared:upcoming",
      "Shipped:upcoming",
      "Delivered:upcoming",
    ]);
    expect(statusHeadline(cod)).toBe("Waiting for confirmation");
  });

  it("marks confirmed, prepared and shipped as the order moves, with the courier note", () => {
    expect(states(order({ orderStatus: "confirmed", paymentStatus: "verified" })).slice(3)).toEqual([
      "Confirmed:current",
      "Being prepared:upcoming",
      "Shipped:upcoming",
      "Delivered:upcoming",
    ]);
    expect(statusHeadline(order({ orderStatus: "processing", paymentStatus: "verified" }))).toBe("Being prepared");

    const shipped = order({ orderStatus: "shipped", paymentStatus: "verified", courier: "TCS", trackingNote: "CN 123456" });
    const shippedStep = buildTimeline(shipped).find((step) => step.label === "Shipped");
    expect(shippedStep).toEqual({ label: "Shipped", state: "current", note: "TCS · CN 123456" });
  });

  it("shows everything done once delivered", () => {
    const delivered = order({ orderStatus: "delivered", paymentMethod: "cod", paymentStatus: "cod_collected" });
    expect(buildTimeline(delivered).every((step) => step.state === "done")).toBe(true);
    expect(statusHeadline(delivered)).toBe("Delivered");
  });

  it("replaces the path with the outcome and reason for rejected and cancelled orders", () => {
    expect(buildTimeline(order({ orderStatus: "rejected", rejectionReason: "Out of stock" }))).toEqual([
      { label: "Order placed", state: "done", note: null },
      { label: "Rejected", state: "current", note: "Out of stock" },
    ]);
    expect(buildTimeline(order({ orderStatus: "cancelled" }))[1]).toEqual({ label: "Cancelled", state: "current", note: null });
  });
});
