import { describe, expect, it } from "vitest";
import {
  buildOrderApprovedEmail,
  buildOrderClosedEmail,
  buildOrderReceivedEmail,
  buildOrderShippedEmail,
  buildOwnerAlertEmail,
  type StoreInfo,
} from "./templates";

const STORE: StoreInfo = { name: "RS Home", phone: "03218581969", whatsapp: "923218581969", address: "Karachi, Pakistan" };
const ORDER_URL = "http://localhost:3000/order/RSH-261001-ABCD";

describe("buildOrderReceivedEmail", () => {
  it("renders the items, the products total and the order link", () => {
    const email = buildOrderReceivedEmail({
      orderNumber: "RSH-261001-ABCD",
      paymentMethod: "cod",
      items: [{ name: "Tea Set (White)", quantity: 2, lineTotal: "PKR 9,000" }],
      productsTotal: "PKR 9,000",
      nextStepsNote: "We will contact you on WhatsApp.",
      orderUrl: ORDER_URL,
      store: STORE,
    });

    expect(email.subject).toContain("RSH-261001-ABCD");
    expect(email.html).toContain("Tea Set (White)");
    expect(email.html).toContain("PKR 9,000");
    expect(email.html).toContain(ORDER_URL);
    expect(email.text).toContain("Tea Set (White)");
    expect(email.text).toContain("PKR 9,000");
    expect(email.text).toContain(ORDER_URL);
    expect(email.text).toContain("We will contact you on WhatsApp.");
  });

  it("mentions cash on delivery for COD and the screenshot for bank transfer", () => {
    const cod = buildOrderReceivedEmail({
      orderNumber: "RSH-1",
      paymentMethod: "cod",
      items: [],
      productsTotal: "PKR 1,000",
      nextStepsNote: "",
      orderUrl: ORDER_URL,
      store: STORE,
    });
    expect(cod.text.toLowerCase()).toContain("cash on delivery");

    const bank = buildOrderReceivedEmail({
      orderNumber: "RSH-2",
      paymentMethod: "bank_transfer",
      items: [],
      productsTotal: "PKR 1,000",
      nextStepsNote: "",
      orderUrl: ORDER_URL,
      store: STORE,
    });
    expect(bank.text.toLowerCase()).toContain("screenshot");
  });
});

describe("buildOrderApprovedEmail", () => {
  it("tells a COD customer the delivery charge and the cash total", () => {
    const email = buildOrderApprovedEmail({
      orderNumber: "RSH-1",
      paymentMethod: "cod",
      deliveryCharge: "PKR 450",
      total: "PKR 9,450",
      dueByTransfer: false,
      orderUrl: ORDER_URL,
      store: STORE,
    });
    expect(email.text).toContain("PKR 450");
    expect(email.text).toContain("PKR 9,450");
    expect(email.text.toLowerCase()).toContain("cash on delivery");
  });

  it("asks a bank-transfer customer still owing the charge to pay it on their order page", () => {
    const email = buildOrderApprovedEmail({
      orderNumber: "RSH-1",
      paymentMethod: "bank_transfer",
      deliveryCharge: "PKR 450",
      total: "PKR 9,450",
      dueByTransfer: true,
      orderUrl: ORDER_URL,
      store: STORE,
    });
    expect(email.text).toContain("PKR 450");
    expect(email.text).toContain("PKR 9,450");
    expect(email.text.toLowerCase()).toContain("pay it on your order page");
  });

  it("just confirms preparation for a bank-transfer order with nothing further due", () => {
    const email = buildOrderApprovedEmail({
      orderNumber: "RSH-1",
      paymentMethod: "bank_transfer",
      deliveryCharge: "PKR 0",
      total: "PKR 9,000",
      dueByTransfer: false,
      orderUrl: ORDER_URL,
      store: STORE,
    });
    expect(email.text.toLowerCase()).not.toContain("pay it on your order page");
    expect(email.text.toLowerCase()).toContain("preparing");
  });
});

describe("buildOrderShippedEmail", () => {
  it("includes the courier and tracking note when set", () => {
    const email = buildOrderShippedEmail({
      orderNumber: "RSH-1",
      courier: "TCS",
      trackingNote: "TRK123456",
      orderUrl: ORDER_URL,
      store: STORE,
    });
    expect(email.text).toContain("TCS");
    expect(email.text).toContain("TRK123456");
  });

  it("still sends something sensible when neither was set", () => {
    const email = buildOrderShippedEmail({ orderNumber: "RSH-1", courier: null, trackingNote: null, orderUrl: ORDER_URL, store: STORE });
    expect(email.text.toLowerCase()).toContain("on its way");
  });
});

describe("buildOrderClosedEmail", () => {
  it("includes the reason for a rejected order", () => {
    const email = buildOrderClosedEmail({ orderNumber: "RSH-1", action: "rejected", reason: "Item out of stock", orderUrl: ORDER_URL, store: STORE });
    expect(email.subject.toLowerCase()).toContain("rejected");
    expect(email.text).toContain("Item out of stock");
  });

  it("includes the reason for a cancelled order", () => {
    const email = buildOrderClosedEmail({ orderNumber: "RSH-1", action: "cancelled", reason: "Customer changed their mind", orderUrl: ORDER_URL, store: STORE });
    expect(email.subject.toLowerCase()).toContain("cancelled");
    expect(email.text).toContain("Customer changed their mind");
  });
});

describe("buildOwnerAlertEmail", () => {
  // The store's own published contact footer is expected on every email (features/mail/templates.ts
  // wrap()); what must never appear is a customer's own name, phone, address or email.
  const FORBIDDEN = ["ali khan", "customer", "@gmail", "@yahoo", "house "];

  it("carries only the order number and a link, same as the push payload", () => {
    const email = buildOwnerAlertEmail({ title: "New COD order", orderNumber: "RSH-1", url: "http://localhost:3000/panel/orders/cod/RSH-1", store: STORE });
    expect(email.text).toContain("RSH-1");
    expect(email.text).toContain("http://localhost:3000/panel/orders/cod/RSH-1");
    for (const term of FORBIDDEN) expect(email.text.toLowerCase()).not.toContain(term);
  });

  it("has no order number at all for a wholesale inquiry", () => {
    const email = buildOwnerAlertEmail({ title: "New wholesale inquiry", orderNumber: null, url: "http://localhost:3000/panel/wholesale", store: STORE });
    expect(email.text).not.toMatch(/RSH-/);
  });
});
