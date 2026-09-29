import { z } from "zod";
import { COUNTRY_CODES } from "@/config/countries";
import { cartInputSchema } from "@/features/cart/schemas";
import { normalizePhone } from "@/lib/phone";

/** Trimmed text that is stored as null when left empty. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value ? value : null));

/** Validates and normalises in one step, so services only ever see the stored form. */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter your phone number.")
  .max(32, "Enter a valid phone number.")
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (normalized === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, with the country code outside Pakistan." });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Everything the browser sends to place an order. Prices never travel: the lines are variant ids
 * and quantities, and `expectedTotal` is the quote's total echoed back so a changed price is
 * refused rather than silently charged (ARCHITECTURE.md D11).
 */
export const checkoutInputSchema = z.object({
  checkoutToken: z.uuid(),
  name: z.string().trim().min(2, "Enter your full name.").max(150, "Enter a shorter name."),
  phone: phoneSchema,
  email: optionalText(191).pipe(z.email("Enter a valid email address.").nullable()),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((code) => COUNTRY_CODES.has(code), "Choose your country."),
  city: z.string().trim().min(2, "Enter your city.").max(100, "Enter a shorter city name."),
  addressLine: z.string().trim().min(5, "Enter your delivery address.").max(255, "Enter a shorter address."),
  postalCode: optionalText(20),
  note: optionalText(1000),
  paymentMethod: z.enum(["cod", "bank_transfer"], { error: "Choose a payment method." }),
  lines: cartInputSchema.shape.lines.min(1, "Your cart is empty."),
  couponCode: cartInputSchema.shape.couponCode,
  expectedTotal: z.string().regex(/^\d+\.\d{2}$/),
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

/** The first message per field, keyed by field name, for the form and the action alike. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

/** Loose enough for any prefix (config/site.config.ts); the DB lookup decides whether it exists. */
export const orderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,6}-\d{6}-[A-Z0-9]{4}$/, "Enter your order number, e.g. RSH-260929-ABCD.");

export const trackInputSchema = z.object({
  orderNumber: orderNumberSchema,
  phone: phoneSchema,
});
