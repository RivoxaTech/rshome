import "@/lib/zod-config";
import { z } from "zod";
import { decimalToPaisa, paisaToDecimal } from "./money";

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * A PKR amount typed as plain text in a panel form, round-tripped through the paisa helpers
 * (CLAUDE.md #6: never a float) so only a normalised DECIMAL(12,2) string (e.g. "1500.00") is
 * ever stored or compared. Shared by the products, discounts and coupons forms.
 */
export const moneyField = (message = "Enter a valid amount, e.g. 1500 or 1500.00.") =>
  z
    .string()
    .trim()
    .regex(MONEY_PATTERN, message)
    .transform((value) => paisaToDecimal(decimalToPaisa(value)));

/** `""`/missing -> `null`, so an optional amount is stored as NULL rather than an empty string. */
export const optionalMoneyField = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z
    .string()
    .trim()
    .regex(MONEY_PATTERN, "Enter a valid amount, e.g. 1500 or 1500.00.")
    .transform((value) => paisaToDecimal(decimalToPaisa(value)))
    .nullable(),
);
