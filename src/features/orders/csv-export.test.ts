import { describe, expect, it } from "vitest";
import { ORDER_EXPORT_HEADERS, orderExportRowValues } from "./csv-export";
import type { OrderExportRow } from "./staff-repo";

function row(overrides: Partial<OrderExportRow> = {}): OrderExportRow {
  return {
    orderNumber: "RSH-261003-0001",
    createdAt: new Date("2026-10-03T09:30:00.000Z"),
    orderStatus: "delivered",
    paymentMethod: "cod",
    paymentStatus: "cod_collected",
    customerName: "Ayesha Raza",
    phone: "923211234567",
    city: "Karachi",
    country: "PK",
    itemsCount: 2,
    subtotal: "3000.00",
    discountTotal: "0.00",
    shippingTotal: "250.00",
    total: "3250.00",
    couponCode: "WELCOME10",
    ...overrides,
  };
}

describe("ORDER_EXPORT_HEADERS", () => {
  it("has 15 columns matching AD-06", () => {
    expect(ORDER_EXPORT_HEADERS).toEqual([
      "Order number",
      "Created at",
      "Status",
      "Payment method",
      "Payment status",
      "Customer name",
      "Phone",
      "City",
      "Country",
      "Items",
      "Subtotal",
      "Discount",
      "Delivery charge",
      "Total",
      "Coupon code",
    ]);
  });
});

describe("orderExportRowValues", () => {
  it("formats every column in header order", () => {
    const values = orderExportRowValues(row());
    expect(values[0]).toBe("RSH-261003-0001");
    expect(values[2]).toBe("Completed");
    expect(values[3]).toBe("Cash on delivery");
    expect(values[9]).toBe("2");
    expect(values[13]).toBe("3250.00");
    expect(values[14]).toBe("WELCOME10");
  });

  it("formats the created-at date in Asia/Karachi time", () => {
    const values = orderExportRowValues(row());
    // 09:30 UTC -> 14:30 Karachi (+05:00)
    expect(values[1]).toContain("14:30");
  });

  it("leaves the delivery charge blank while it's still pending", () => {
    const values = orderExportRowValues(row({ shippingTotal: null }));
    expect(values[12]).toBe("");
  });

  it("leaves the coupon code blank when there is none", () => {
    const values = orderExportRowValues(row({ couponCode: null }));
    expect(values[14]).toBe("");
  });

  it("formats the phone number for display", () => {
    const values = orderExportRowValues(row({ phone: "923211234567" }));
    expect(values[6]).not.toBe("923211234567");
  });
});
