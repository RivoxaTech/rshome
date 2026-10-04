import { siteConfig } from "@/config/site.config";
import { karachiFormatter } from "@/lib/karachi-datetime";

/** No 0/O, 1/I/L: an order number read out on WhatsApp can't be misheard (ARCHITECTURE.md D14). */
export const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SUFFIX_LENGTH = 4;

const dateStamp = karachiFormatter({ year: "2-digit", month: "2-digit", day: "2-digit" });

/** YYMMDD in the store's timezone: "today" means Karachi time (ARCHITECTURE.md D12). */
export function orderDateStamp(now: Date): string {
  const parts = dateStamp.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}${part("month")}${part("day")}`;
}

/**
 * `PREFIX-YYMMDD-XXXX`. `randomIndex(n)` returns an integer in [0, n); the service passes
 * `crypto.randomInt`, tests pass something predictable. A collision is a duplicate-key error the
 * caller retries.
 */
export function generateOrderNumber(now: Date, randomIndex: (max: number) => number): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += ORDER_NUMBER_ALPHABET[randomIndex(ORDER_NUMBER_ALPHABET.length)];
  }
  return `${siteConfig.orderNumberPrefix}-${orderDateStamp(now)}-${suffix}`;
}
