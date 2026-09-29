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
