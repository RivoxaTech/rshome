/**
 * The panel's orders pages (REQUIREMENTS AD-02, AD-03, owner decisions C20, C21): the tab counts,
 * one page of a method's orders, and an order's detail, every amount already formatted
 * (CLAUDE.md #5) and every status step filtered by the viewer's permissions. The Server
 * Components check `order.view` first.
 */
import { cache } from "react";
import { features } from "@/config/features";
import { siteConfig } from "@/config/site.config";
import { PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { getPrimaryImagesByProductId } from "@/features/catalog/repo";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { goodsTotalOf } from "@/features/pricing/pricing";
import { formatPhone } from "@/lib/phone";
import { env } from "@/server/env";
import { getOrderByNumber, getOrderItems } from "./repo";
import { paymentProgress, type PaymentMethod, type ProofState, type TimelineOrder } from "./status";
import { countOrdersByState, getOrderHistory, getProofsForStaff, listOrders } from "./staff-repo";
import {
  ORDER_STATUS_LABELS,
  ORDER_TABS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PROOF_PURPOSE_LABELS,
  actionTarget,
  deliveryScreenshotToCheck,
  needsAction,
  orderTab,
  ordersPath,
  statusActions,
  type OrderTab,
  type QueueOrder,
  type StatusAction,
} from "./transitions";

const PAGE_SIZE = 20;

/** What each status step needs; the Server Actions in app/panel/(protected)/orders/actions.ts check the same. */
export const ACTION_PERMISSIONS: Record<StatusAction, PermissionKey[]> = {
  // Approving sets the delivery charge, approves the payment screenshot and moves the order on.
  approve: [PERMISSIONS.ORDER_SET_SHIPPING, PERMISSIONS.ORDER_VERIFY_PAYMENT, PERMISSIONS.ORDER_UPDATE_STATUS],
  check_delivery: [PERMISSIONS.ORDER_VERIFY_PAYMENT],
  ship: [PERMISSIONS.ORDER_UPDATE_STATUS],
  complete: [PERMISSIONS.ORDER_UPDATE_STATUS],
  cancel: [PERMISSIONS.ORDER_UPDATE_STATUS],
  reject: [PERMISSIONS.ORDER_UPDATE_STATUS],
};

const zoned = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: siteConfig.timezone, ...options });
const dateTime = zoned({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = zoned({ day: "numeric", month: "short", year: "numeric" });
const timeOnly = zoned({ hour: "2-digit", minute: "2-digit" });

const money = (decimal: string) => formatMoney(decimalToPaisa(decimal));

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

// ── Counts ──────────────────────────────────────────────────────────────────────────────────

export type TabCounts = Record<OrderTab | "all", number> & { toCheck: number; needsAction: number };

function emptyCounts(): TabCounts {
  const counts = Object.fromEntries([...ORDER_TABS, "all"].map((tab) => [tab, 0])) as Record<OrderTab | "all", number>;
  return { ...counts, toCheck: 0, needsAction: 0 };
}

/**
 * Per payment method: orders per tab, every order, the delivery charge screenshots to check and
 * the orders needing staff (the sidebar badge). Once per request: the layout and page share it.
 */
export const getOrderCounts = cache(async (): Promise<Record<PaymentMethod, TabCounts>> => {
  const counts: Record<PaymentMethod, TabCounts> = { bank_transfer: emptyCounts(), cod: emptyCounts() };
  for (const row of await countOrdersByState()) {
    const method = counts[row.paymentMethod];
    method.all += row.count;
    method[orderTab(row)] += row.count;
    if (deliveryScreenshotToCheck(row)) method.toCheck += row.count;
    if (needsAction(row)) method.needsAction += row.count;
  }
  return counts;
});

// ── What a row or the detail page can do ────────────────────────────────────────────────────

type StaffProof = Awaited<ReturnType<typeof getProofsForStaff>>[number];

const PROOF_STATUS_LABELS = { submitted: "To check", verified: "Approved", rejected: "Rejected" } as const;

function proofView(proof: StaffProof) {
  return {
    id: proof.id,
    purpose: proof.purpose,
    purposeLabel: PROOF_PURPOSE_LABELS[proof.purpose],
    status: proof.status,
    statusLabel: PROOF_STATUS_LABELS[proof.status],
    rejectionReason: proof.rejectionReason,
    uploadedAt: dateTime.format(proof.createdAt),
    reviewed: proof.reviewedAt ? `${proof.reviewerName ?? "Staff"}, ${dateTime.format(proof.reviewedAt)}` : null,
  };
}

export type ProofView = ReturnType<typeof proofView>;

type ControlOrder = QueueOrder &
  Omit<TimelineOrder, "proofs"> & { orderNumber: string; subtotal: string; discountTotal: string; couponDiscount: string; total: string };

/** Under the status pill: what a bank order that offers nothing forward is waiting for. */
function waitingNote(order: QueueOrder, goods: ProofState | "not_due"): string | null {
  const tab = orderTab(order);
  if (tab === "need_review" && order.paymentMethod === "bank_transfer" && (goods === "rejected" || goods === "missing")) {
    return "Waiting for a new payment screenshot";
  }
  if (tab !== "pending_delivery") return null;
  if (order.paymentStatus === "proof_submitted") return "Delivery charge screenshot to check";
  return order.paymentStatus === "rejected" ? "Screenshot rejected, waiting for a new one" : "Waiting for the delivery charge";
}

/**
 * The status pill, its next steps and what their dialogs show, for one order. `proofs` are the
 * order's screenshots, newest first.
 */
function orderControl(order: ControlOrder, proofs: StaffProof[], permissions: ReadonlySet<PermissionKey>) {
  const progress = paymentProgress({ ...order, proofs }, features.deliveryChargeByTransfer);
  const allowed = (action: StatusAction) => ACTION_PERMISSIONS[action].every((key) => permissions.has(key));
  const latest = (purpose: "goods" | "delivery") => {
    const proof = proofs.find((row) => row.purpose === purpose);
    return proof ? proofView(proof) : null;
  };
  const goodsTotal = goodsTotalOf({
    subtotal: decimalToPaisa(order.subtotal),
    discountTotal: decimalToPaisa(order.discountTotal),
    couponDiscount: decimalToPaisa(order.couponDiscount),
  });

  return {
    orderNumber: order.orderNumber,
    isCod: order.paymentMethod === "cod",
    tab: orderTab(order),
    waiting: waitingNote(order, progress.goods),
    actions: statusActions(order, progress.goods)
      .filter(allowed)
      .map((action) => ({ action, target: actionTarget(action, order.paymentMethod, features.deliveryChargeByTransfer) })),
    goodsTotal: formatMoney(goodsTotal),
    deliveryCharge: order.shippingTotal === null ? null : money(order.shippingTotal),
    total: money(order.total),
    goodsProof: latest("goods"),
    deliveryProof: latest("delivery"),
    /** Rejecting a screenshot is a review, not a status step. */
    canRejectProof: permissions.has(PERMISSIONS.ORDER_VERIFY_PAYMENT),
    deliveryChargeByTransfer: features.deliveryChargeByTransfer,
  };
}

export type OrderControl = ReturnType<typeof orderControl>;

// ── The list ────────────────────────────────────────────────────────────────────────────────

export async function listStaffOrders(
  method: PaymentMethod,
  tab: OrderTab | "all",
  query: { q?: string; page: number },
  permissions: ReadonlySet<PermissionKey>,
) {
  const offset = (query.page - 1) * PAGE_SIZE;
  const { rows, total } = await listOrders(method, tab, query.q, { limit: PAGE_SIZE, offset });
  const proofs = await getProofsForStaff(rows.map((row) => row.id));
  const items = rows.map((row, index) => ({
    serial: offset + index + 1,
    orderNumber: row.orderNumber,
    placedDate: dateOnly.format(row.createdAt),
    placedTime: timeOnly.format(row.createdAt),
    customerName: row.customerName,
    total: money(row.total),
    screenshotToCheck: deliveryScreenshotToCheck(row),
    control: orderControl(
      row,
      proofs.filter((proof) => proof.orderId === row.id),
      permissions,
    ),
  }));
  return { items, total, page: query.page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type StaffOrderListItem = Awaited<ReturnType<typeof listStaffOrders>>["items"][number];

// ── The detail page ─────────────────────────────────────────────────────────────────────────

function historyLabel(kind: "order" | "payment" | "note", status: string | null): string | null {
  if (!status) return null;
  const labels: Record<string, string> = kind === "payment" ? PAYMENT_STATUS_LABELS : ORDER_STATUS_LABELS;
  return labels[status] ?? status;
}

/** The shop-to-customer WhatsApp message for the order's stage (C13). */
function whatsAppMessage(order: NonNullable<Awaited<ReturnType<typeof getOrderByNumber>>>, deliveryCharge: string | null): string {
  const messages = siteConfig.staffWhatsAppMessages;
  const rejected = order.paymentStatus === "rejected";
  let message: string = messages.general;
  switch (orderTab(order)) {
    case "need_review":
      if (rejected) message = messages.screenshotRejected;
      break;
    case "pending_delivery":
      if (rejected) message = messages.screenshotRejected;
      else if (order.paymentStatus === "unpaid") message = messages.approvedDeliveryDue;
      break;
    case "processing":
      message = order.paymentMethod === "cod" ? messages.approvedCod : messages.approved;
      break;
    case "delivery":
      message = messages.sent;
      break;
  }
  return fill(message, {
    name: order.customerName,
    store: siteConfig.storeName,
    orderNumber: order.orderNumber,
    deliveryCharge: deliveryCharge ?? "",
    total: money(order.total),
    orderUrl: new URL(`/order/${order.orderNumber}`, env.APP_URL).toString(),
  });
}

export type StaffOrderView = NonNullable<Awaited<ReturnType<typeof getStaffOrder>>>;

export async function getStaffOrder(orderNumber: string, permissions: ReadonlySet<PermissionKey>) {
  const order = await getOrderByNumber(orderNumber);
  if (!order) return null;
  const [items, proofs, history] = await Promise.all([getOrderItems(order.id), getProofsForStaff([order.id]), getOrderHistory(order.id)]);
  const images = await getPrimaryImagesByProductId([...new Set(items.map((item) => item.productId))]);

  const control = orderControl(order, proofs, permissions);
  const countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(order.country) ?? order.country;

  return {
    orderNumber: order.orderNumber,
    placedAt: dateTime.format(order.createdAt),
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod],
    paymentStatus: order.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.paymentStatus],
    /** Where the back link goes when the page wasn't opened from a list. */
    homeList: ordersPath(order.paymentMethod, control.tab),
    control,
    rejectionReason: order.rejectionReason,
    delivery: { charge: control.deliveryCharge, note: order.shippingNote, courier: order.courier, trackingNote: order.trackingNote },
    proofs: proofs.map(proofView),
    whatsApp: { phone: order.phone, message: whatsAppMessage(order, control.deliveryCharge) },
    customer: { name: order.customerName, phone: formatPhone(order.phone), phoneDigits: order.phone, email: order.email },
    address: [order.addressLine, [order.city, order.state, order.postalCode].filter(Boolean).join(" "), countryName].filter(Boolean),
    customerNote: order.customerNote,
    items: items.map((item) => {
      const image = images.get(item.productId);
      return {
        id: item.id,
        name: item.nameSnapshot,
        variantLabel: item.variantLabelSnapshot || null,
        sku: item.skuSnapshot,
        quantity: item.quantity,
        unitPrice: money(item.unitPrice),
        discount: decimalToPaisa(item.discountAmount) > 0 ? money(item.discountAmount) : null,
        lineTotal: money(item.lineTotal),
        image: image ? { path: image.path, alt: image.alt ?? item.nameSnapshot } : null,
      };
    }),
    totals: {
      subtotal: money(order.subtotal),
      discountTotal: decimalToPaisa(order.discountTotal) > 0 ? money(order.discountTotal) : null,
      coupon: order.couponCode ? { code: order.couponCode, discount: money(order.couponDiscount) } : null,
      goodsTotal: control.goodsTotal,
      deliveryCharge: control.deliveryCharge,
      total: control.total,
    },
    history: history.map((row) => ({
      id: row.id,
      at: dateTime.format(row.createdAt),
      kind: row.kind,
      from: historyLabel(row.kind, row.fromStatus),
      to: historyLabel(row.kind, row.toStatus),
      note: row.note,
      by: row.userName ?? "Customer",
    })),
    canAddNote: permissions.has(PERMISSIONS.ORDER_UPDATE_STATUS),
  };
}
