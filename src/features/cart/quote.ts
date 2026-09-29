/**
 * Pure cart quote logic (no DB): reconciles the browser's lines with live variant data and
 * turns a `CartCalculation` into the server-formatted quote the UI displays. `service.ts` loads
 * the data; this file is unit-tested on plain data.
 */
import type { ProductImage } from "@/features/catalog/service";
import { toDisplayPrice, type DisplayPrice } from "@/features/pricing/display";
import { formatMoney, type Paisa } from "@/features/pricing/money";
import type { CartCalculation, CartLineInput, CouponRejectReason } from "@/features/pricing/pricing";
import { MAX_LINE_QUANTITY, type CartInputLine } from "./schemas";

/** A variant as the quote needs it: plain data in paisa, availability already resolved. */
export type CartVariant = {
  id: number;
  productId: number;
  productName: string;
  productSlug: string;
  /** The variant's label, or null for a simple product's only variant (no attributes to show). */
  variantLabel: string | null;
  /** False when the variant or its product is inactive: the line is dropped. */
  available: boolean;
  stock: number;
  productPrice: Paisa;
  priceOverride: Paisa | null;
  categoryId: number;
  parentCategoryId: number | null;
  image: ProductImage | null;
};

export type ReconciledLine = { variantId: number; quantity: number; variant: CartVariant };

/** Something the server changed about the cart, for the UI to show once. */
export type CartNotice = { kind: "line" | "coupon"; message: string };

export type ReconciledCart = {
  lines: ReconciledLine[];
  notices: CartNotice[];
};

function displayName(variant: CartVariant): string {
  return variant.variantLabel ? `${variant.productName} (${variant.variantLabel})` : variant.productName;
}

/**
 * Fixes the browser's cart against live data: merges duplicate variant ids, drops unknown,
 * inactive and sold-out variants, and caps quantities at stock, reporting each change.
 */
export function reconcileCart(lines: CartInputLine[], variants: CartVariant[]): ReconciledCart {
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  const wanted = new Map<number, number>();
  for (const line of lines) {
    wanted.set(line.variantId, Math.min(MAX_LINE_QUANTITY, (wanted.get(line.variantId) ?? 0) + line.quantity));
  }

  const result: ReconciledCart = { lines: [], notices: [] };
  const notice = (message: string) => result.notices.push({ kind: "line", message });
  for (const [variantId, quantity] of wanted) {
    const variant = variantById.get(variantId);
    if (!variant || !variant.available) {
      notice(
        variant ? `${displayName(variant)} is no longer available and was removed.` : "An item is no longer available and was removed.",
      );
      continue;
    }
    if (variant.stock <= 0) {
      notice(`${displayName(variant)} is sold out and was removed.`);
      continue;
    }
    if (quantity > variant.stock) {
      notice(`Only ${variant.stock} of ${displayName(variant)} available; the quantity was reduced.`);
    }
    result.lines.push({ variantId, quantity: Math.min(quantity, variant.stock), variant });
  }
  return result;
}

export function toCartLineInputs(lines: ReconciledLine[]): CartLineInput[] {
  return lines.map(({ variantId, quantity, variant }) => ({
    variantId,
    quantity,
    product: {
      id: variant.productId,
      price: variant.productPrice,
      categoryId: variant.categoryId,
      parentCategoryId: variant.parentCategoryId,
    },
    priceOverride: variant.priceOverride,
  }));
}

export type CartQuoteLine = {
  variantId: number;
  productSlug: string;
  name: string;
  variantLabel: string | null;
  image: ProductImage | null;
  quantity: number;
  /** The most the customer can order right now; the UI disables "+" at this number. */
  maxQuantity: number;
  unitPrice: DisplayPrice;
  lineTotal: string;
};

export type CartQuoteCoupon =
  | { status: "none" }
  | { status: "applied"; code: string; discount: string }
  | { status: "rejected"; code: string; reason: CouponRejectReason | "COUPON_RATE_LIMITED"; message: string };

/** The whole cart as the browser shows it: every amount is a server-formatted string. */
export type CartQuote = {
  lines: CartQuoteLine[];
  /** Σ quantities, for the header badge. */
  itemCount: number;
  subtotal: string;
  /** Null when no line is discounted. */
  discountTotal: string | null;
  coupon: CartQuoteCoupon;
  delivery: { status: "pending" } | { status: "priced"; amount: string };
  total: string;
  notices: CartNotice[];
  /** What the browser should now store: the reconciled lines and the code only while it applies. */
  storedLines: CartInputLine[];
  storedCouponCode: string | null;
};

export function formatCartQuote(
  lines: ReconciledLine[],
  calculation: CartCalculation,
  notices: CartNotice[],
  couponOverride: CartQuoteCoupon | null = null,
): CartQuote {
  const variantById = new Map(lines.map((line) => [line.variantId, line.variant]));
  const calcCoupon = calculation.coupon;
  const coupon: CartQuoteCoupon =
    couponOverride ??
    (calcCoupon.status === "applied"
      ? { status: "applied", code: calcCoupon.code, discount: formatMoney(calcCoupon.discount) }
      : calcCoupon);

  const allNotices = [...notices];
  if (coupon.status === "rejected") {
    allNotices.push({ kind: "coupon", message: `Coupon ${coupon.code} was removed: ${coupon.message}` });
  }

  return {
    lines: calculation.lines.map((line) => {
      const variant = variantById.get(line.variantId)!;
      return {
        variantId: line.variantId,
        productSlug: variant.productSlug,
        name: variant.productName,
        variantLabel: variant.variantLabel,
        image: variant.image,
        quantity: line.quantity,
        maxQuantity: Math.min(MAX_LINE_QUANTITY, variant.stock),
        unitPrice: toDisplayPrice(line.price),
        lineTotal: formatMoney(line.lineTotal),
      };
    }),
    itemCount: calculation.lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: formatMoney(calculation.subtotal),
    discountTotal: calculation.discountTotal > 0 ? formatMoney(calculation.discountTotal) : null,
    coupon,
    delivery:
      calculation.shipping.status === "priced"
        ? { status: "priced", amount: formatMoney(calculation.shipping.amount) }
        : { status: "pending" },
    total: formatMoney(calculation.total),
    notices: allNotices,
    storedLines: lines.map(({ variantId, quantity }) => ({ variantId, quantity })),
    storedCouponCode: coupon.status === "applied" ? coupon.code : null,
  };
}
