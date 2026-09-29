import { formatMoney } from "./money";
import { percentOff, type VariantPrice } from "./pricing";

/** Server-formatted, so the browser never does money maths (CLAUDE.md #5). */
export type DisplayPrice = {
  amount: string;
  /** The struck-through base price, set only when a discount applies. */
  original: string | null;
  badge: string | null;
};

export function toDisplayPrice(price: VariantPrice): DisplayPrice {
  if (price.discountId === null) return { amount: formatMoney(price.unitPrice), original: null, badge: null };
  const off = percentOff(price);
  return {
    amount: formatMoney(price.unitPrice),
    original: formatMoney(price.basePrice),
    badge: off > 0 ? `${off}% off` : "Sale",
  };
}
