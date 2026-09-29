import { randomInt } from "node:crypto";
import { hasDisplayableAttributes } from "@/features/cart/service";
import { decimalToPaisa, paisaToDecimal } from "@/features/pricing/money";
import type { CartLineInput } from "@/features/pricing/pricing";
import { loadCoupon, priceCart } from "@/features/pricing/service";
import { resolveShippingZone } from "@/features/shipping/service";
import type { ResolvedZone } from "@/features/shipping/zones";
import { db } from "@/server/db/client";
import { consumeRateLimit } from "@/server/rate-limit";
import { generateOrderNumber } from "./order-number";
import {
  decrementVariantStock,
  findOrderNumberByCheckoutToken,
  getProductsForCheckout,
  insertOrder,
  insertOrderItems,
  insertStatusHistory,
  lockVariantRows,
  recordCouponUsage,
  type CheckoutProductRow,
  type LockedVariantRow,
} from "./repo";
import { checkoutInputSchema, fieldErrorsOf, type CheckoutInput } from "./schemas";

const CHECKOUT_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };
const ORDER_NUMBER_ATTEMPTS = 5;
const MYSQL_DUPLICATE_ENTRY = 1062;
const MYSQL_DEADLOCK = 1213;

export const PRICES_CHANGED_MESSAGE = "Prices changed, please review your order before placing it.";
export const COD_PAKISTAN_ONLY_MESSAGE = "Cash on delivery is available in Pakistan only. Please choose bank transfer.";

export type CreateOrderResult =
  | { ok: true; orderNumber: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** A refusal with a message the customer sees; anything else thrown is a real failure. */
class CheckoutError extends Error {}

/** Drizzle wraps driver errors (`DrizzleQueryError.cause`); the mysql2 error carries `errno`. */
function mysqlError(error: unknown): { errno?: number; sqlMessage?: string } | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = "cause" in error && typeof error.cause === "object" && error.cause !== null ? error.cause : error;
  return candidate as { errno?: number; sqlMessage?: string };
}

function isDuplicateOn(error: unknown, keyName: string): boolean {
  const cause = mysqlError(error);
  return cause?.errno === MYSQL_DUPLICATE_ENTRY && (cause.sqlMessage ?? "").includes(keyName);
}

async function withDeadlockRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (mysqlError(error)?.errno !== MYSQL_DEADLOCK) throw error;
    return run();
  }
}

function itemName(product: CheckoutProductRow, variant: LockedVariantRow): string {
  return hasDisplayableAttributes(variant.attributes) ? `${product.name} (${variant.label})` : product.name;
}

/** Duplicate ids merged, capped like the cart, in ascending id order for the locks. */
function mergeLines(lines: CheckoutInput["lines"]): Map<number, number> {
  const merged = new Map<number, number>();
  for (const line of lines) merged.set(line.variantId, Math.min(99, (merged.get(line.variantId) ?? 0) + line.quantity));
  return new Map([...merged].sort(([a], [b]) => a - b));
}

/**
 * The whole order in one transaction (ARCHITECTURE.md §4.2 steps 4–9). Throws `CheckoutError`
 * with a customer-facing message when the order must be refused; nothing is written then.
 */
async function placeOrder(input: CheckoutInput, zone: ResolvedZone): Promise<string> {
  return db.transaction(async (tx) => {
    const wanted = mergeLines(input.lines);
    const variants = await lockVariantRows(tx, [...wanted.keys()]);
    const productRows = await getProductsForCheckout(tx, [...new Set(variants.map((variant) => variant.productId))]);
    const productById = new Map(productRows.map((product) => [product.id, product]));
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    const lines: CartLineInput[] = [];
    const snapshots: { variant: LockedVariantRow; product: CheckoutProductRow; quantity: number }[] = [];
    for (const [variantId, quantity] of wanted) {
      const variant = variantById.get(variantId);
      const product = variant ? productById.get(variant.productId) : undefined;
      if (!variant || !product) throw new CheckoutError("An item in your cart is no longer available. Please review your cart.");
      const name = itemName(product, variant);
      if (product.status !== "active" || !variant.isActive) {
        throw new CheckoutError(`${name} is no longer available. Please remove it from your cart.`);
      }
      if (variant.stock <= 0) throw new CheckoutError(`${name} is sold out. Please remove it from your cart.`);
      if (variant.stock < quantity) {
        throw new CheckoutError(`Only ${variant.stock} of ${name} left. Please update the quantity in your cart.`);
      }
      lines.push({
        variantId,
        quantity,
        product: {
          id: product.id,
          price: decimalToPaisa(product.price),
          categoryId: product.categoryId,
          parentCategoryId: product.parentCategoryId,
        },
        priceOverride: variant.priceOverride === null ? null : decimalToPaisa(variant.priceOverride),
      });
      snapshots.push({ variant, product, quantity });
    }

    // The coupon row is locked so the usage limits are checked against a count nobody else can move.
    const coupon = await loadCoupon(input.couponCode, input.phone, { db: tx, lock: true });
    const calculation = await priceCart({ lines, couponCode: input.couponCode, coupon, zone: zone.pricing, country: input.country });

    if (calculation.coupon.status === "rejected") {
      throw new CheckoutError(`${calculation.coupon.message} Please remove the coupon and try again.`);
    }
    if (input.paymentMethod === "cod" && !calculation.codAvailable) throw new CheckoutError(COD_PAKISTAN_ONLY_MESSAGE);
    if (paisaToDecimal(calculation.total) !== input.expectedTotal) throw new CheckoutError(PRICES_CHANGED_MESSAGE);

    const shippingPending = calculation.shipping.status === "pending";
    const orderStatus = shippingPending ? "awaiting_shipping_quote" : "pending";
    const paymentStatus = input.paymentMethod === "cod" ? "cod_pending" : "unpaid";
    const total = paisaToDecimal(calculation.total);
    const now = new Date();

    const orderValues = {
      checkoutToken: input.checkoutToken,
      customerName: input.name,
      phone: input.phone,
      email: input.email,
      addressLine: input.addressLine,
      city: input.city,
      postalCode: input.postalCode,
      country: input.country,
      shippingZoneId: zone.id,
      paymentMethod: input.paymentMethod,
      orderStatus,
      paymentStatus,
      subtotal: paisaToDecimal(calculation.subtotal),
      discountTotal: paisaToDecimal(calculation.discountTotal),
      couponId: calculation.coupon.status === "applied" ? calculation.coupon.couponId : null,
      couponCode: calculation.coupon.status === "applied" ? calculation.coupon.code : null,
      couponDiscount: paisaToDecimal(calculation.couponDiscount),
      shippingTotal: calculation.shipping.status === "priced" ? paisaToDecimal(calculation.shipping.amount) : null,
      total,
      displayCurrency: "PKR",
      exchangeRate: "1.0000",
      displayTotal: total,
      customerNote: input.note,
      createdAt: now,
      updatedAt: now,
    } as const;

    // A random number can collide (D14): retry the insert with a fresh one inside the same transaction.
    let orderId: number | null = null;
    let orderNumber = "";
    for (let attempt = 0; attempt < ORDER_NUMBER_ATTEMPTS && orderId === null; attempt += 1) {
      orderNumber = generateOrderNumber(now, randomInt);
      try {
        orderId = await insertOrder(tx, { ...orderValues, orderNumber });
      } catch (error) {
        if (!isDuplicateOn(error, "order_number")) throw error;
      }
    }
    if (orderId === null) throw new Error(`Could not allocate an order number after ${ORDER_NUMBER_ATTEMPTS} attempts.`);

    const linesByVariant = new Map(calculation.lines.map((line) => [line.variantId, line]));
    await insertOrderItems(
      tx,
      snapshots.map(({ variant, product, quantity }) => {
        const line = linesByVariant.get(variant.id)!;
        return {
          orderId,
          productId: product.id,
          variantId: variant.id,
          nameSnapshot: product.name,
          // A simple product's only variant has no label the customer ever saw.
          variantLabelSnapshot: hasDisplayableAttributes(variant.attributes) ? variant.label : "",
          skuSnapshot: variant.sku,
          unitPrice: paisaToDecimal(line.price.basePrice),
          discountAmount: paisaToDecimal(line.price.basePrice - line.price.unitPrice),
          quantity,
          lineTotal: paisaToDecimal(line.lineTotal),
        };
      }),
    );

    for (const { variant, quantity } of snapshots) await decrementVariantStock(tx, variant.id, quantity);
    if (calculation.coupon.status === "applied") await recordCouponUsage(tx, calculation.coupon.couponId, orderId, input.phone);

    await insertStatusHistory(tx, [
      { orderId, kind: "order", fromStatus: null, toStatus: orderStatus, note: "Order placed", changedBy: null, createdAt: now },
      { orderId, kind: "payment", fromStatus: null, toStatus: paymentStatus, note: null, changedBy: null, createdAt: now },
    ]);

    return orderNumber;
  });
}

/**
 * Places an order (ARCHITECTURE.md §4.2): validate, rate-limit by IP, return the existing order
 * for a repeated `checkoutToken`, resolve the zone, then run the transaction, once more on a
 * deadlock. The caller (the Server Action) grants the order-access cookie on success.
 */
export async function createOrder(rawInput: unknown, ctx: { ip: string }): Promise<CreateOrderResult> {
  const parsed = checkoutInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error) };
  const input = parsed.data;

  const limit = await consumeRateLimit(`checkout:ip:${ctx.ip}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return { ok: false, error: "Too many attempts. Please try again in a few minutes." };

  const existing = await findOrderNumberByCheckoutToken(input.checkoutToken);
  if (existing) return { ok: true, orderNumber: existing };

  // The hard rule (§4.1): COD never leaves Pakistan, whatever zone the request claims.
  if (input.paymentMethod === "cod" && input.country !== "PK") return { ok: false, error: COD_PAKISTAN_ONLY_MESSAGE };

  const zone = await resolveShippingZone(input.country, input.city);
  if (!zone) return { ok: false, error: "We can't deliver to this address yet. Please contact us on WhatsApp." };

  try {
    const orderNumber = await withDeadlockRetry(() => placeOrder(input, zone));
    return { ok: true, orderNumber };
  } catch (error) {
    if (error instanceof CheckoutError) return { ok: false, error: error.message };
    // Two submits with the same token raced past the check above: the first one's order wins.
    if (isDuplicateOn(error, "checkout_token")) {
      const raced = await findOrderNumberByCheckoutToken(input.checkoutToken);
      if (raced) return { ok: true, orderNumber: raced };
    }
    throw error;
  }
}
