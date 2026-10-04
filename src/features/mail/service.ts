/**
 * Customer order-lifecycle emails (BUILD_PLAN.md S21 Phase 2), fired from the app layer (checkout,
 * the panel's staff actions) after their transaction, via `after()`. Each function re-reads the
 * order fresh (it only runs microseconds after the commit) and is a no-op when there's no email —
 * never blocking or failing the action that triggered it.
 */
import { siteConfig } from "@/config/site.config";
import { features } from "@/config/features";
import { insertAuditLog } from "@/features/audit/repo";
import { getOrderByNumber, getOrderItems } from "@/features/orders/repo";
import { paymentProgress } from "@/features/orders/status";
import { getProofSummaries } from "@/features/payments/repo";
import { decimalToPaisa, formatMoney } from "@/features/pricing/money";
import { getContactInfo, getStoreIdentity } from "@/features/settings/service";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { sendMail } from "@/server/mail/transport";
import {
  buildOrderApprovedEmail,
  buildOrderClosedEmail,
  buildOrderReceivedEmail,
  buildOrderShippedEmail,
  type StoreInfo,
} from "./templates";

async function logMailFailure(orderNumber: string, message: string): Promise<void> {
  try {
    await insertAuditLog(db, {
      userId: null,
      action: "notify.failed",
      entity: "notify",
      entityId: orderNumber,
      oldValues: null,
      newValues: { channel: "mail", reason: message },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("notify.failed could not be recorded", orderNumber, error);
  }
}

/** Also used by `features/notify/service.ts` for the owner-alert email channel. */
export async function loadStore(): Promise<StoreInfo> {
  const [contact, identity] = await Promise.all([getContactInfo(), getStoreIdentity()]);
  return { name: identity.storeName, phone: contact.phone, whatsapp: contact.whatsapp, address: contact.address };
}

function orderUrl(orderNumber: string): string {
  return new URL(`/order/${orderNumber}`, env.APP_URL).toString();
}

/**
 * Every sender runs inside this (S22 BUG-15): the reads that build the email can fail too (the
 * database dropping between the commit and the `after()` task), and `after()` would only
 * log that — the `notify.failed` audit row is the record the owner actually sees.
 */
async function guarded(orderNumber: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (error) {
    await logMailFailure(orderNumber, error instanceof Error ? error.message : "Unknown error");
  }
}

/** Sends, swallowing and logging any failure — the one rule every caller below relies on. */
async function send(orderNumber: string, to: string, content: { subject: string; html: string; text: string }): Promise<void> {
  try {
    await sendMail({ to, ...content });
  } catch (error) {
    await logMailFailure(orderNumber, error instanceof Error ? error.message : "Unknown error");
  }
}

/** Fired once, right after `createOrder` (ARCHITECTURE.md §4.2 step 10), only when an email was given. */
export function sendOrderReceivedEmail(orderNumber: string): Promise<void> {
  return guarded(orderNumber, () => sendOrderReceivedEmailUnguarded(orderNumber));
}

async function sendOrderReceivedEmailUnguarded(orderNumber: string): Promise<void> {
  const order = await getOrderByNumber(orderNumber);
  if (!order || !order.email) return;

  const items = await getOrderItems(order.id);
  const store = await loadStore();
  const content = buildOrderReceivedEmail({
    orderNumber,
    paymentMethod: order.paymentMethod,
    items: items.map((item) => ({
      name: item.variantLabelSnapshot ? `${item.nameSnapshot} (${item.variantLabelSnapshot})` : item.nameSnapshot,
      quantity: item.quantity,
      lineTotal: formatMoney(decimalToPaisa(item.lineTotal)),
    })),
    productsTotal: formatMoney(decimalToPaisa(order.total)),
    nextStepsNote: siteConfig.deliveryPendingNote,
    orderUrl: orderUrl(orderNumber),
    store,
  });
  await send(orderNumber, order.email, content);
}

/** Fired after `approveOrder` sets the delivery charge and moves the order on. */
export function sendOrderApprovedEmail(orderNumber: string): Promise<void> {
  return guarded(orderNumber, () => sendOrderApprovedEmailUnguarded(orderNumber));
}

async function sendOrderApprovedEmailUnguarded(orderNumber: string): Promise<void> {
  const order = await getOrderByNumber(orderNumber);
  if (!order || !order.email || order.shippingTotal === null) return;

  const proofs = await getProofSummaries(order.id);
  const progress = paymentProgress({ ...order, proofs }, features.deliveryChargeByTransfer);
  const store = await loadStore();
  const content = buildOrderApprovedEmail({
    orderNumber,
    paymentMethod: order.paymentMethod,
    deliveryCharge: formatMoney(decimalToPaisa(order.shippingTotal)),
    total: formatMoney(decimalToPaisa(order.total)),
    dueByTransfer: order.paymentMethod === "bank_transfer" && progress.delivery === "missing",
    orderUrl: orderUrl(orderNumber),
    store,
  });
  await send(orderNumber, order.email, content);
}

/** Fired after `updateFulfilment` moves the order to `shipped` (never for `delivered`). */
export function sendOrderShippedEmail(orderNumber: string): Promise<void> {
  return guarded(orderNumber, () => sendOrderShippedEmailUnguarded(orderNumber));
}

async function sendOrderShippedEmailUnguarded(orderNumber: string): Promise<void> {
  const order = await getOrderByNumber(orderNumber);
  if (!order || !order.email) return;

  const store = await loadStore();
  const content = buildOrderShippedEmail({
    orderNumber,
    courier: order.courier,
    trackingNote: order.trackingNote,
    orderUrl: orderUrl(orderNumber),
    store,
  });
  await send(orderNumber, order.email, content);
}

/** Fired after `closeOrder`, or `reviewProof`'s reject branch (D37: rejecting a screenshot rejects the whole order). */
export function sendOrderClosedEmail(orderNumber: string): Promise<void> {
  return guarded(orderNumber, () => sendOrderClosedEmailUnguarded(orderNumber));
}

async function sendOrderClosedEmailUnguarded(orderNumber: string): Promise<void> {
  const order = await getOrderByNumber(orderNumber);
  if (!order || !order.email) return;
  if (order.orderStatus !== "rejected" && order.orderStatus !== "cancelled") return;

  const store = await loadStore();
  const content = buildOrderClosedEmail({
    orderNumber,
    action: order.orderStatus,
    reason: order.rejectionReason ?? "",
    orderUrl: orderUrl(orderNumber),
    store,
  });
  await send(orderNumber, order.email, content);
}
