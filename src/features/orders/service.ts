import { features } from "@/config/features";
import { trackInputSchema } from "@/features/checkout/schemas";
import { getProofSummaries } from "@/features/payments/repo";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { goodsTotalOf } from "@/features/pricing/pricing";
import { formatPhone } from "@/lib/phone";
import { consumeRateLimit } from "@/server/rate-limit";
import { findOrderNumberByNumberAndPhone, getOrderByNumber, getOrderItems } from "./repo";
import {
  buildTimeline,
  paymentProgress,
  statusHeadline,
  uploadPurpose,
  type OrderStatus,
  type PaymentMethod,
  type PaymentProgress,
  type ProofPurpose,
  type TimelineStep,
} from "./status";
import { karachiFormatter } from "@/lib/karachi-datetime";

const TRACK_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };
const TRACK_NOT_FOUND = "We couldn't find an order with that order number and phone number.";

type TrackOrderResult = { ok: true; orderNumber: string } | { ok: false; error: string };

/**
 * `/track` (ARCHITECTURE.md §4.5, D23): order number plus the checkout phone, rate-limited per
 * IP. A miss never says which half was wrong.
 */
export async function trackOrder(rawInput: unknown, ctx: { ip: string }): Promise<TrackOrderResult> {
  const limit = await consumeRateLimit(`track:ip:${ctx.ip}`, TRACK_RATE_LIMIT);
  if (!limit.allowed) return { ok: false, error: "Too many attempts. Please try again in a few minutes." };

  const parsed = trackInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Enter your order number and the phone number you used at checkout." };

  const orderNumber = await findOrderNumberByNumberAndPhone(parsed.data.orderNumber, parsed.data.phone);
  return orderNumber ? { ok: true, orderNumber } : { ok: false, error: TRACK_NOT_FOUND };
}

const placedAtFormat = karachiFormatter({ day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The order page's data, every amount already formatted (CLAUDE.md #5). */
export type CustomerOrderView = {
  orderNumber: string;
  placedAt: string;
  headline: string;
  timeline: TimelineStep[];
  orderStatus: OrderStatus;
  paymentMethod: PaymentMethod;
  /** Bank transfer only: where each of the two payments stands (owner decision, S8). */
  payment: PaymentProgress & {
    /** The goods after discounts and coupon, paid at checkout. */
    goodsTotal: string;
    /** Null until staff set the delivery charge. */
    deliveryCharge: string | null;
    /** How the delivery charge is paid (`features.deliveryChargeByTransfer`). */
    deliveryChargeByTransfer: boolean;
    /** What a new screenshot would pay for now, if anything. A rejected screenshot closes the whole
     * order (owner decision, S9), so an upload is only ever due when nothing has been sent yet. */
    upload: { purpose: ProofPurpose; amount: string } | null;
  };
  customer: { name: string; phone: string; email: string | null };
  address: string[];
  note: string | null;
  items: { id: number; name: string; variantLabel: string | null; quantity: number; unitPrice: string; lineTotal: string }[];
  totals: {
    subtotal: string;
    discountTotal: string | null;
    coupon: { code: string; discount: string } | null;
    delivery: { status: "pending" } | { status: "priced"; amount: string; note: string | null };
    total: string;
  };
};

export async function getCustomerOrder(orderNumber: string): Promise<CustomerOrderView | null> {
  const row = await getOrderByNumber(orderNumber);
  if (!row) return null;
  const [items, proofs] = await Promise.all([getOrderItems(row.id), getProofSummaries(row.id)]);
  const order = { ...row, proofs };
  const countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(order.country) ?? order.country;

  const progress = paymentProgress(order, features.deliveryChargeByTransfer);
  const goodsTotal = formatMoney(
    goodsTotalOf({
      subtotal: decimalToPaisa(order.subtotal),
      discountTotal: decimalToPaisa(order.discountTotal),
      couponDiscount: decimalToPaisa(order.couponDiscount),
    }),
  );
  const deliveryCharge = order.shippingTotal === null ? null : formatMoney(decimalToPaisa(order.shippingTotal));
  const purpose = uploadPurpose(order, progress);
  // A delivery upload is only ever due once the charge is set, so its amount exists then.
  const uploadAmount = purpose === "delivery" ? deliveryCharge : goodsTotal;

  return {
    orderNumber: order.orderNumber,
    placedAt: placedAtFormat.format(order.createdAt),
    headline: statusHeadline(order, progress),
    timeline: buildTimeline(order, progress),
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    payment: {
      ...progress,
      goodsTotal,
      deliveryCharge,
      deliveryChargeByTransfer: features.deliveryChargeByTransfer,
      upload: purpose && uploadAmount ? { purpose, amount: uploadAmount } : null,
    },
    customer: { name: order.customerName, phone: formatPhone(order.phone), email: order.email },
    address: [order.addressLine, [order.city, order.postalCode].filter(Boolean).join(" "), countryName],
    note: order.customerNote,
    items: items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      variantLabel: item.variantLabelSnapshot || null,
      quantity: item.quantity,
      unitPrice: formatMoney(decimalToPaisa(item.unitPrice) - decimalToPaisa(item.discountAmount)),
      lineTotal: formatMoney(decimalToPaisa(item.lineTotal)),
    })),
    totals: {
      subtotal: formatMoney(decimalToPaisa(order.subtotal)),
      discountTotal: decimalToPaisa(order.discountTotal) > 0 ? formatMoney(decimalToPaisa(order.discountTotal)) : null,
      coupon: order.couponCode ? { code: order.couponCode, discount: formatMoney(decimalToPaisa(order.couponDiscount)) } : null,
      delivery:
        order.shippingTotal === null
          ? { status: "pending" }
          : { status: "priced", amount: formatMoney(decimalToPaisa(order.shippingTotal)), note: order.shippingNote },
      total: formatMoney(decimalToPaisa(order.total)),
    },
  };
}
