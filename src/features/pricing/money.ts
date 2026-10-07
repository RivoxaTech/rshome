/**
 * Money lives in integer paisa inside this module (CLAUDE.md #6: never floats for totals).
 * `decimalToPaisa`/`paisaToDecimal` are the only place that convert to and from the
 * DECIMAL(12,2) strings Drizzle returns. `pricing.ts` (S5/S6) builds discount and cart
 * maths on top of these.
 */

/** Integer paisa (1/100 PKR). */
export type Paisa = number;

/**
 * Converts a DECIMAL(12,2) string (e.g. "4500.00") to integer paisa (450000). Every caller's own
 * type says `string` (what Drizzle/mysql2 return for a real DECIMAL column), but a raw SQL
 * expression mixing types inside a `CASE`/`COALESCE` can make MySQL and MariaDB report a
 * different column type for the same query — one driver then hands back a plain number instead
 * (S22 follow-up, 7 Oct: found live on a MariaDB host, never reproducible against MySQL — see
 * `features/dashboard/repo.ts`, now fixed at the query with an explicit `CAST`). Coerced here too,
 * belt and braces, since this function is the one place in the app that assumes the shape.
 */
export function decimalToPaisa(decimal: string | number): Paisa {
  const [wholePart, fractionPart = ""] = String(decimal).trim().split(".");
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

/**
 * How far `newPaisa` is from `oldPaisa`, as a signed percentage (e.g. 50 for a 50% increase, -50
 * for a halving); `null` when there's no old price to compare against. Panel-only UI guard (S10
 * phase 2: a product price edit over 50% either way asks for confirmation, a typo guard) — never a
 * server-side rule.
 */
export function percentPriceChange(oldPaisa: Paisa, newPaisa: Paisa): number | null {
  if (oldPaisa === 0) return null;
  return ((newPaisa - oldPaisa) / Math.abs(oldPaisa)) * 100;
}
