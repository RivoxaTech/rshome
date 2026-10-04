import { describe, expect, it } from "vitest";
import { cartInputSchema, cartQuoteRequestSchema } from "./schemas";

const lines = [{ variantId: 1, quantity: 2 }];

/**
 * S22 BUG-01: the checkout's extras (phone, destination, a stored coupon code) ride along with the
 * cart, but a bad one must never fail the whole quote — the cart provider treats a failed quote as
 * corrupt storage and empties the cart. Only unreadable lines may fail.
 */
describe("cartQuoteRequestSchema", () => {
  it("drops an over-long city or phone instead of failing the quote", () => {
    const city = cartQuoteRequestSchema.safeParse({ lines, destination: { country: "PK", city: "x".repeat(101) } });
    expect(city.success).toBe(true);
    if (city.success) expect(city.data.destination).toBeNull();

    const phone = cartQuoteRequestSchema.safeParse({ lines, phone: "0".repeat(33) });
    expect(phone.success).toBe(true);
    if (phone.success) expect(phone.data.phone).toBeNull();

    const code = cartQuoteRequestSchema.safeParse({ lines, couponCode: "C".repeat(51) });
    expect(code.success).toBe(true);
    if (code.success) expect(code.data.couponCode).toBeNull();
  });

  it("keeps a valid phone, destination and code", () => {
    const parsed = cartQuoteRequestSchema.safeParse({ lines, phone: " 03001234567 ", destination: { country: "PK", city: " Karachi " }, couponCode: " welcome10 " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ lines, phone: "03001234567", destination: { country: "PK", city: "Karachi" }, couponCode: "welcome10" });
  });

  it("still fails for lines that can't be read (the one case that means corrupt storage)", () => {
    expect(cartQuoteRequestSchema.safeParse({ lines: [{ variantId: "x", quantity: 1 }] }).success).toBe(false);
    expect(cartQuoteRequestSchema.safeParse({ lines: "nope" }).success).toBe(false);
    expect(cartInputSchema.safeParse({ lines: [{ variantId: 1, quantity: 100 }] }).success).toBe(false);
  });
});
