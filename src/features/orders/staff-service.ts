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
import { getStoreIdentity } from "@/features/settings/service";
import { formatPhone } from "@/lib/phone";
import { env } from "@/server/env";
import { getOrderByNumber, getOrderItems } from "./repo";
import { latestProofStates, type LatestProofs, type PaymentMethod, type ProofPurpose, type TimelineOrder } from "./status";
import { countOrdersByState, getOrderHistory, getProofsForStaff, listOrders } from "./staff-repo";
import {
  ORDER_STATUS_LABELS,
  ORDER_TABS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PROOF_PURPOSE_LABELS,
  TAB_INFO,
  actionTarget,
  goodsState,
  needsAction,
  orderStatusIfApproved,
  orderTab,
  ordersPath,
  screenshotToCheck,
  screenshotsToCheck,
  statusActions,
  type FlagOrder,
  type OrderTab,
  type QueueOrder,
  type StatusAction,
} from "./transitions";
import { DEFAULT_PAGE_SIZE, pageCountOf } from "@/features/shared/pagination";
import { karachiFormatter } from "@/lib/karachi-datetime";

/** What each status step needs; the Server Actions in app/panel/(protected)/orders/actions.ts check the same. */
export const ACTION_PERMISSIONS: Record<StatusAction, PermissionKey[]> = {
  // Approving sets the delivery charge, approves the payment screenshot and moves the order on.
  approve: [PERMISSIONS.ORDER_SET_SHIPPING, PERMISSIONS.ORDER_VERIFY_PAYMENT, PERMISSIONS.ORDER_UPDATE_STATUS],
  check_screenshot: [PERMISSIONS.ORDER_VERIFY_PAYMENT],
  approve_whatsapp: [PERMISSIONS.ORDER_VERIFY_PAYMENT],
  ship: [PERMISSIONS.ORDER_UPDATE_STATUS],
  complete: [PERMISSIONS.ORDER_UPDATE_STATUS],
  cancel: [PERMISSIONS.ORDER_UPDATE_STATUS],
  reject: [PERMISSIONS.ORDER_UPDATE_STATUS],
};

const dateTime = karachiFormatter({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = karachiFormatter({ day: "numeric", month: "short", year: "numeric" });
const timeOnly = karachiFormatter({ hour: "2-digit", minute: "2-digit" });

const money = (decimal: string) => formatMoney(decimalToPaisa(decimal));

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

// ── Counts ──────────────────────────────────────────────────────────────────────────────────

export type TabCounts = Record<OrderTab | "all", number> & {
  /** Per tab, the orders with a screenshot to check (the tab's dot). */
  toCheck: Record<OrderTab, number>;
  needsAction: number;
};

const zeroPerTab = () => Object.fromEntries(ORDER_TABS.map((tab) => [tab, 0])) as Record<OrderTab, number>;

function emptyCounts(): TabCounts {
  return { ...zeroPerTab(), all: 0, toCheck: zeroPerTab(), needsAction: 0 };
}

/**
 * Per payment method: orders per tab, every order, the orders with a screenshot to check per tab
 * and the orders needing staff (the sidebar badge), the flags read from each payment's latest
 * screenshot (C22). Once per request: the layout and page share it.
 */
export const getOrderCounts = cache(async (): Promise<Record<PaymentMethod, TabCounts>> => {
  const counts: Record<PaymentMethod, TabCounts> = { bank_transfer: emptyCounts(), cod: emptyCounts() };
  for (const row of await countOrdersByState()) {
    const order: FlagOrder = { ...row, latest: { goods: row.goods ?? "missing", delivery: row.delivery ?? "missing" } };
    const method = counts[row.paymentMethod];
    const tab = orderTab(order);
    method.all += row.count;
    method[tab] += row.count;
    if (screenshotToCheck(order)) method.toCheck[tab] += row.count;
    if (needsAction(order)) method.needsAction += row.count;
  }
  return counts;
});

/**
 * The sidebar's per-nav-item counts (`nav-items.ts` keys): `{}` for a viewer without `order.view`
 * (the Developer, since S9b) so the panel layout never even queries orders for them.
 *
 * The `-new` pair (S22 follow-up) is the raw Need review tab count, not `needsAction`: it's what
 * `OrderCountsPoller` compares poll to poll to decide a notification sound is warranted. Unlike
 * `needsAction`, this count never grows just because an existing (already-approved) order's second
 * screenshot needs checking — only a genuinely new order landing in Need review moves it, so the
 * poll fallback (no push) rings for the same reason the push payload's `new_order` type does.
 */
export async function getOrderCountsForPermissions(
  permissions: ReadonlySet<PermissionKey>,
): Promise<Partial<Record<string, number>>> {
  if (!permissions.has(PERMISSIONS.ORDER_VIEW)) return {};
  const counts = await getOrderCounts();
  return {
    "orders-bank": counts.bank_transfer.needsAction,
    "orders-cod": counts.cod.needsAction,
    "orders-bank-new": counts.bank_transfer.need_review,
    "orders-cod-new": counts.cod.need_review,
  };
}

// ── What a row or the detail page can do ────────────────────────────────────────────────────

type StaffProof = Awaited<ReturnType<typeof getProofsForStaff>>[number];

const PROOF_STATUS_LABELS = { submitted: "To check", verified: "Verified", rejected: "Rejected" } as const;

function proofView(proof: StaffProof) {
  return {
    id: proof.id,
    purpose: proof.purpose,
    purposeLabel: PROOF_PURPOSE_LABELS[proof.purpose],
    /** `whatsapp` (D63): staff confirmed the payment by hand, no file to show — the UI shows that instead of a thumbnail. */
    channel: proof.channel,
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

/** The status pill's words: the tab, except a bank order in Need review that has no products screenshot yet. */
function statusLabel(order: FlagOrder): string {
  const tab = orderTab(order);
  return tab === "need_review" && goodsState(order) === "missing" ? "Waiting for payment screenshot" : TAB_INFO[tab].label;
}

/** Under the status pill: a screenshot to check, or what a bank order that offers nothing forward waits for. */
function waitingNote(order: FlagOrder): string | null {
  const toCheck = screenshotsToCheck(order);
  if (toCheck.length > 1) return "Both screenshots to check";
  if (toCheck.length === 1) return `${PROOF_PURPOSE_LABELS[toCheck[0]]} screenshot to check`;
  if (order.paymentMethod !== "bank_transfer") return null;
  const { delivery } = order.latest;
  switch (orderTab(order)) {
    case "pending_delivery":
      return delivery === "submitted" ? null : "Waiting for the delivery charge";
    default:
      return null;
  }
}

/** What approving a waiting screenshot does, for its dialog. */
function reviewEffect(order: ControlOrder, proofs: StaffProof[], purpose: ProofPurpose, waiting: ProofPurpose[]): string | null {
  const next = orderStatusIfApproved({ ...order, proofs }, purpose, features.deliveryChargeByTransfer);
  if (next !== order.orderStatus) return `Approving moves the order to ${ORDER_STATUS_LABELS[next]}.`;
  const other = waiting.find((waitingPurpose) => waitingPurpose !== purpose);
  if (other) return `Then check the ${PROOF_PURPOSE_LABELS[other].toLowerCase()} screenshot.`;
  return order.orderStatus === "pending" ? "The order stays in Pending delivery charge until both payments are approved." : null;
}

/**
 * The status pill, its next steps and what their dialogs show, for one order. `proofs` are the
 * order's screenshots, newest first; every flag reads each payment's latest one (C22).
 */
function orderControl(order: ControlOrder, proofs: StaffProof[], permissions: ReadonlySet<PermissionKey>) {
  const flags: FlagOrder = { ...order, latest: latestProofStates(proofs) };
  const allowed = (action: StatusAction) => ACTION_PERMISSIONS[action].every((key) => permissions.has(key));
  const latest = (purpose: ProofPurpose) => proofs.find((row) => row.purpose === purpose);
  const goodsTotal = formatMoney(
    goodsTotalOf({
      subtotal: decimalToPaisa(order.subtotal),
      discountTotal: decimalToPaisa(order.discountTotal),
      couponDiscount: decimalToPaisa(order.couponDiscount),
    }),
  );
  const deliveryCharge = order.shippingTotal === null ? null : money(order.shippingTotal);
  const waiting = screenshotsToCheck(flags);
  const goodsProof = latest("goods");

  return {
    orderNumber: order.orderNumber,
    isCod: order.paymentMethod === "cod",
    tab: orderTab(order),
    statusLabel: statusLabel(flags),
    waiting: waitingNote(flags),
    actions: statusActions(flags)
      .filter(allowed)
      .map((action) => ({ action, target: actionTarget(action, order.paymentMethod, features.deliveryChargeByTransfer) })),
    goodsTotal,
    deliveryCharge,
    total: money(order.total),
    /** The products screenshot the Approve dialog shows (bank transfer). */
    goodsProof: goodsProof ? proofView(goodsProof) : null,
    /** The screenshots waiting to be checked outside Need review, products first: the check dialog shows the first. */
    toCheck: waiting.map((purpose) => ({
      ...proofView(latest(purpose)!),
      amount: purpose === "goods" ? goodsTotal : deliveryCharge,
      effect: reviewEffect(order, proofs, purpose, waiting),
    })),
    /** Checking a screenshot is a review, not a status step: it needs only the payment permission.
     * Rejecting one rejects the whole order, so the Server Action checks `order.update_status` too. */
    canReviewProofs: permissions.has(PERMISSIONS.ORDER_VERIFY_PAYMENT),
    deliveryChargeByTransfer: features.deliveryChargeByTransfer,
  };
}

export type OrderControl = ReturnType<typeof orderControl>;

// ── The list ────────────────────────────────────────────────────────────────────────────────

export async function listStaffOrders(
  method: PaymentMethod,
  tab: OrderTab | "all",
  query: { q?: string; page: number; pageSize?: number },
  permissions: ReadonlySet<PermissionKey>,
) {
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (query.page - 1) * pageSize;
  const { rows, total } = await listOrders(method, tab, query.q, { limit: pageSize, offset });
  const proofs = await getProofsForStaff(rows.map((row) => row.id));
  const items = rows.map((row, index) => {
    const control = orderControl(
      row,
      proofs.filter((proof) => proof.orderId === row.id),
      permissions,
    );
    return {
      serial: offset + index + 1,
      orderNumber: row.orderNumber,
      placedDate: dateOnly.format(row.createdAt),
      placedTime: timeOnly.format(row.createdAt),
      customerName: row.customerName,
      total: money(row.total),
      screenshotToCheck: control.toCheck.length > 0,
      control,
    };
  });
  return { items, total, page: query.page, pageSize, pageCount: pageCountOf(total, pageSize) };
}

export type StaffOrderListItem = Awaited<ReturnType<typeof listStaffOrders>>["items"][number];

// ── The detail page ─────────────────────────────────────────────────────────────────────────

function historyLabel(kind: "order" | "payment" | "note", status: string | null): string | null {
  if (!status) return null;
  const labels: Record<string, string> = kind === "payment" ? PAYMENT_STATUS_LABELS : ORDER_STATUS_LABELS;
  return labels[status] ?? status;
}

type StaffOrderRow = NonNullable<Awaited<ReturnType<typeof getOrderByNumber>>>;

/** The shop-to-customer WhatsApp message for the order's stage (C13), from each payment's latest screenshot. */
function whatsAppMessage(order: StaffOrderRow, latest: LatestProofs, deliveryCharge: string | null, storeName: string): string {
  const messages = siteConfig.staffWhatsAppMessages;
  const bank = order.paymentMethod === "bank_transfer";
  let message: string = messages.general;
  switch (orderTab(order)) {
    case "need_review":
      if (bank && latest.goods === "missing") message = messages.screenshotMissing;
      break;
    case "pending_delivery":
      if (latest.delivery === "missing") message = messages.approvedDeliveryDue;
      break;
    case "processing":
      message = order.paymentMethod === "cod" ? messages.approvedCod : messages.approved;
      break;
    case "delivery":
      message = messages.sent;
      break;
    case "rejected":
      message = messages.screenshotRejected;
      break;
  }
  return fill(message, {
    name: order.customerName,
    store: storeName,
    reason: order.rejectionReason ?? "",
    orderNumber: order.orderNumber,
    deliveryCharge: deliveryCharge ?? "",
    total: money(order.total),
    orderUrl: new URL(`/order/${order.orderNumber}`, env.APP_URL).toString(),
  });
}

/**
 * On the detail page: what a bank order waits for from the customer (C22). Null when nothing
 * waits on the customer. A rejected screenshot rejects the whole order (owner decision, S9), so
 * neither Need review nor Pending delivery charge ever waits on a re-upload any more.
 */
function customerWait(order: FlagOrder, deliveryCharge: string | null): { title: string; text: string } | null {
  if (order.paymentMethod !== "bank_transfer") return null;
  const tab = orderTab(order);
  if (tab !== "need_review" && tab !== "pending_delivery") return null;
  const { goods, delivery } = order.latest;
  if (goods === "missing") {
    return {
      title: "No payment screenshot yet",
      text: "The customer hasn't uploaded the products payment screenshot yet, so the order can't be approved. You can remind them on WhatsApp.",
    };
  }
  if (tab === "need_review") return null;
  if (delivery === "missing") return { title: "Waiting for the delivery charge", text: `The customer has to transfer ${deliveryCharge} and upload the screenshot.` };
  return null;
}

export type StaffOrderView = NonNullable<Awaited<ReturnType<typeof getStaffOrder>>>;

export async function getStaffOrder(orderNumber: string, permissions: ReadonlySet<PermissionKey>) {
  const order = await getOrderByNumber(orderNumber);
  if (!order) return null;
  const [items, proofs, history] = await Promise.all([getOrderItems(order.id), getProofsForStaff([order.id]), getOrderHistory(order.id)]);
  const images = await getPrimaryImagesByProductId([...new Set(items.map((item) => item.productId))]);

  const control = orderControl(order, proofs, permissions);
  const latest = latestProofStates(proofs);
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
    customerWait: customerWait({ ...order, latest }, control.deliveryCharge),
    whatsApp: { phone: order.phone, message: whatsAppMessage(order, latest, control.deliveryCharge, (await getStoreIdentity()).storeName) },
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
        image: image ? { path: image.path, width: image.width, height: image.height, alt: image.alt ?? item.nameSnapshot } : null,
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
