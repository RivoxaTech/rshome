/**
 * Money lives in integer paisa inside this module (CLAUDE.md #6: never floats for totals).
 * `decimalToPaisa`/`paisaToDecimal` are the only place that convert to and from the
 * DECIMAL(12,2) strings Drizzle returns. `pricing.ts` (S5/S6) builds discount and cart
 * maths on top of these.
 */

/** Integer paisa (1/100 PKR). */
export type Paisa = number;

/** Converts a DECIMAL(12,2) string (e.g. "4500.00") to integer paisa (450000). */
export function decimalToPaisa(decimal: string): Paisa {
  const [wholePart, fractionPart = ""] = decimal.trim().split(".");
  const whole = Number(wholePart);
  const fraction = Number(fractionPart.padEnd(2, "0").slice(0, 2));
  const sign = whole < 0 || wholePart.startsWith("-") ? -1 : 1;
  return whole * 100 + sign * fraction;
}

/** Converts integer paisa back to a DECIMAL(12,2) string, e.g. 450000 -> "4500.00". */
export function paisaToDecimal(paisa: Paisa): string {
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(paisa);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${sign}${whole}.${String(fraction).padStart(2, "0")}`;
}

/** Formats integer paisa as a whole-rupee PKR string, e.g. "PKR 4,500" (client decision C3: round to whole rupees). */
export function formatMoney(paisa: Paisa): string {
  const rupees = Math.round(paisa / 100);
  return `PKR ${rupees.toLocaleString("en-PK")}`;
}
