import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StaffOrderView } from "@/features/orders/staff-service";
import { OrderSlipView } from "./OrderSlipView";

function fakeOrder(overrides: Partial<StaffOrderView> = {}): StaffOrderView {
  return {
    orderNumber: "RSH-261003-0001",
    placedAt: "3 Oct 2026, 14:30",
    paymentMethod: "cod",
    paymentMethodLabel: "Cash on delivery",
    paymentStatus: "cod_pending",
    paymentStatusLabel: "Pending",
    customer: { name: "Ayesha Raza", phone: "0321 1234567", phoneDigits: "923211234567", email: null },
    address: ["House 1, Street 2, DHA Phase 6", "Karachi", "Pakistan"],
    customerNote: "Please call before delivery.",
    items: [
      { id: 1, name: "Ceramic Dinner Plate", variantLabel: "White", sku: "CDP-WHT-01", quantity: 2, unitPrice: "PKR 1,500", discount: null, lineTotal: "PKR 3,000", image: null },
    ],
    totals: { subtotal: "PKR 3,000", discountTotal: null, coupon: null, goodsTotal: "PKR 3,000", deliveryCharge: null, total: "PKR 3,000" },
    ...overrides,
  } as unknown as StaffOrderView;
}

function render(order: StaffOrderView) {
  return renderToStaticMarkup(
    <OrderSlipView order={order} storeName="RS Home" contactPhone="0321 0000000" contactAddress="Shop 1, Karachi" autoPrint={false} />,
  );
}

describe("OrderSlipView", () => {
  it("shows the order number, customer and item details", () => {
    const html = render(fakeOrder());
    expect(html).toContain("RSH-261003-0001");
    expect(html).toContain("Ayesha Raza");
    expect(html).toContain("Ceramic Dinner Plate");
    expect(html).toContain("CDP-WHT-01");
    expect(html).toContain("PKR 3,000");
  });

  it("shows the amount to collect for a COD order", () => {
    const html = render(fakeOrder());
    expect(html).toContain("Amount to collect");
  });

  it("does not show the amount-to-collect line for a bank-transfer order", () => {
    const html = render(fakeOrder({ paymentMethod: "bank_transfer", paymentMethodLabel: "Bank transfer" }));
    expect(html).not.toContain("Amount to collect");
  });

  it("shows 'To be confirmed' when no delivery charge has been set yet", () => {
    const html = render(fakeOrder());
    expect(html).toContain("To be confirmed");
  });

  it("shows the customer note", () => {
    const html = render(fakeOrder());
    expect(html).toContain("Please call before delivery.");
  });

  it("includes a blank Packed-by line", () => {
    const html = render(fakeOrder());
    expect(html).toContain("Packed by");
  });

  it("never renders bank account details (the component is never given any)", () => {
    const html = render(fakeOrder());
    expect(html.toLowerCase()).not.toContain("iban");
    expect(html.toLowerCase()).not.toContain("account number");
  });

  it("renders in plain black-on-white classes, not the panel's theme tokens", () => {
    const html = render(fakeOrder());
    expect(html).toContain("bg-white");
    expect(html).toContain("text-black");
    expect(html).not.toContain("bg-background");
  });
});
