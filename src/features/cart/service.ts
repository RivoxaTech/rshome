import { features } from "@/config/features";
import { getPrimaryImagesByProductId } from "@/features/catalog/repo";
import { variantAttributesSchema } from "@/features/catalog/schemas";
import { decimalToPaisa } from "@/features/pricing/money";
import { normalizeCouponCode } from "@/features/pricing/pricing";
import { loadCoupon, priceCart } from "@/features/pricing/service";
import { normalizePhone } from "@/lib/phone";
import { consumeRateLimit, resetRateLimit } from "@/server/rate-limit";
import { formatCartQuote, reconcileCart, toCartLineInputs, type CartQuote, type CartVariant } from "./quote";
import { getCartVariantRows, type CartVariantRow } from "./repo";
import { cartQuoteRequestSchema } from "./schemas";

/**
 * Coupon guessing is throttled per IP. Every quote that carries a code consumes an attempt and a
 * successful one gives it back, so a customer reloading with a valid coupon is never blocked
 * while a brute-force run is (the login limiter works the same way).
 */
const COUPON_ATTEMPT_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };

export type CartQuoteResult = { ok: true; quote: CartQuote } | { ok: false; error: string };

/** A variant with attributes shows its label ("Red / Large"); a simple product's only variant doesn't. */
export function hasDisplayableAttributes(raw: string): boolean {
  try {
    return Object.keys(variantAttributesSchema.parse(JSON.parse(raw))).length > 0;
  } catch {
    return false;
  }
}

function toCartVariant(row: CartVariantRow, image: CartVariant["image"]): CartVariant {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    productSlug: row.productSlug,
    variantLabel: hasDisplayableAttributes(row.attributes) ? row.label : null,
    available: row.isActive && row.productStatus === "active",
    stock: row.stock,
    productPrice: decimalToPaisa(row.productPrice),
    priceOverride: row.priceOverride === null ? null : decimalToPaisa(row.priceOverride),
    categoryId: row.categoryId,
    parentCategoryId: row.parentCategoryId,
    image,
  };
}

/**
 * The cart quote (ARCHITECTURE.md §4.1): validates the browser's ids and quantities, loads the
 * live rows, fixes the cart against them, prices it and returns display strings. Nothing the
 * browser sends beyond ids, quantities, a coupon code and (at checkout) a phone number can
 * influence the numbers.
 */
export async function quoteCart(rawInput: unknown, ctx: { ip: string }): Promise<CartQuoteResult> {
  const parsed = cartQuoteRequestSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Your cart could not be read and was reset." };
  const input = parsed.data;

  const rows = await getCartVariantRows([...new Set(input.lines.map((line) => line.variantId))]);
  const images = await getPrimaryImagesByProductId([...new Set(rows.map((row) => row.productId))]);
  const variants = rows.map((row) => {
    const image = images.get(row.productId);
    return toCartVariant(row, image ? { path: image.path, width: image.width, height: image.height, alt: image.alt } : null);
  });

  const reconciled = reconcileCart(input.lines, variants);

  // An emptied cart has nothing for a coupon to apply to, so the code is dropped with the lines.
  const couponCode = reconciled.lines.length > 0 && features.coupons && input.couponCode ? normalizeCouponCode(input.couponCode) : null;
  const couponBucket = `coupon:ip:${ctx.ip}`;
  let couponAllowed = true;
  if (couponCode) {
    const limit = await consumeRateLimit(couponBucket, COUPON_ATTEMPT_LIMIT);
    couponAllowed = limit.allowed;
  }

  const activeCode = couponAllowed ? couponCode : null;
  const customerKey = input.phone ? normalizePhone(input.phone) : null;
  const calculation = await priceCart({
    lines: toCartLineInputs(reconciled.lines),
    couponCode: activeCode,
    coupon: await loadCoupon(activeCode, customerKey),
    zone: null,
    country: null,
  });
  if (couponCode && calculation.coupon.status === "applied") await resetRateLimit(couponBucket);

  const couponOverride =
    couponCode && !couponAllowed
      ? {
          status: "rejected" as const,
          code: couponCode,
          reason: "COUPON_RATE_LIMITED" as const,
          message: "Too many coupon attempts. Please try again later.",
        }
      : null;

  return { ok: true, quote: formatCartQuote(reconciled.lines, calculation, reconciled.notices, couponOverride) };
}
