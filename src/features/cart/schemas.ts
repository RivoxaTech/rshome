import { z } from "zod";

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

/**
 * What the browser stores and sends: variant ids, quantities and a coupon code, nothing else
 * (ARCHITECTURE.md §4.1). `z.object` strips unknown keys, so a "unit price" or "total" smuggled
 * into the request never reaches the service; the quote is computed from live rows only.
 */
export const cartInputSchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
      }),
    )
    .max(MAX_CART_LINES),
  couponCode: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .default(null)
    .transform((code) => (code ? code : null)),
});

export type CartInput = z.infer<typeof cartInputSchema>;
export type CartInputLine = CartInput["lines"][number];

/**
 * A quote request: the stored cart plus, at checkout, the phone number the customer entered (so a
 * coupon's per-customer limit can be checked before the order is placed) and the destination
 * (country and city), so the shipping zone resolves exactly as `createOrder` will resolve it (S14:
 * a `flat` zone prices its charge into the quote's total; a `quote` zone stays "to be confirmed").
 * The cart page and drawer send neither, so their shipping is always pending.
 */
export const cartQuoteRequestSchema = cartInputSchema.extend({
  phone: z.string().trim().max(32).nullable().default(null),
  destination: z
    .object({ country: z.string().trim().max(2), city: z.string().trim().max(100) })
    .nullable()
    .default(null),
});

export type CartQuoteRequest = z.infer<typeof cartQuoteRequestSchema>;
