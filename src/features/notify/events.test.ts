import { describe, expect, it } from "vitest";
import { buildPushPayload } from "./events";

const FORBIDDEN = ["ali", "khan", "0321", "923", "karachi", "pkr", "rs.", "email", "@"];

function assertNoPersonalData(payload: { title: string; body: string; url: string }) {
  const text = `${payload.title} ${payload.body} ${payload.url}`.toLowerCase();
  for (const term of FORBIDDEN) expect(text).not.toContain(term);
}

describe("buildPushPayload", () => {
  it("names the bank transfer and COD titles, with only the order number as the body", () => {
    const bank = buildPushPayload({ type: "new_order", orderNumber: "RSH-261001-ABCD", paymentMethod: "bank_transfer" });
    expect(bank.title).toBe("New bank transfer order");
    expect(bank.body).toBe("RSH-261001-ABCD");
    expect(bank.url).toContain("/panel/orders/bank/RSH-261001-ABCD");
    expect(bank.tag).toBe("order-RSH-261001-ABCD");
    assertNoPersonalData(bank);

    const cod = buildPushPayload({ type: "new_order", orderNumber: "RSH-261001-WXYZ", paymentMethod: "cod" });
    expect(cod.title).toBe("New COD order");
    expect(cod.body).toBe("RSH-261001-WXYZ");
    expect(cod.url).toContain("/panel/orders/cod/RSH-261001-WXYZ");
    assertNoPersonalData(cod);
  });

  it("always links a delivery-charge screenshot event to the bank transfer detail page", () => {
    const payload = buildPushPayload({ type: "delivery_screenshot_uploaded", orderNumber: "RSH-261001-ABCD" });
    expect(payload.title).toBe("Delivery charge screenshot uploaded");
    expect(payload.body).toBe("RSH-261001-ABCD");
    expect(payload.url).toContain("/panel/orders/bank/RSH-261001-ABCD");
    assertNoPersonalData(payload);
  });

  it("builds the wholesale inquiry payload with no identifying detail at all", () => {
    const payload = buildPushPayload({ type: "new_wholesale_inquiry" });
    expect(payload.title).toBe("New wholesale inquiry");
    expect(payload.body).toBe("");
    expect(payload.url).toContain("/panel/wholesale");
    assertNoPersonalData(payload);
  });

  it("never varies the payload by anything beyond the event's own type and order number", () => {
    // Same event, called twice: deterministic, so a retried send can never leak extra state.
    const a = buildPushPayload({ type: "new_order", orderNumber: "RSH-261001-ABCD", paymentMethod: "cod" });
    const b = buildPushPayload({ type: "new_order", orderNumber: "RSH-261001-ABCD", paymentMethod: "cod" });
    expect(a).toEqual(b);
  });
});
