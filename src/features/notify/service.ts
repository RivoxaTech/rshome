import { insertAuditLog } from "@/features/audit/repo";
import { PERMISSIONS } from "@/features/auth/permissions";
import { loadStore } from "@/features/mail/service";
import { buildOwnerAlertEmail } from "@/features/mail/templates";
import type { PaymentMethod } from "@/features/orders/status";
import { getNotifyOwnerOrderEmails, getNotifyOwnerWholesaleEmails } from "@/features/settings/service";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { sendPush } from "@/server/notify/push";
import { sendMail } from "@/server/mail/transport";
import { buildPushPayload, type NotifyEvent } from "./events";
import {
  deleteSubscription,
  deleteSubscriptionById,
  listSubscriptionsForPermission,
  listSubscriptionsForUser,
  touchSubscription,
  upsertSubscription,
  type StoredSubscription,
} from "./repo";
import type { PushSubscribeInput } from "./schemas";

/** A send answering 404 or 410 means the browser dropped the subscription; we stop trying it. */
const STALE_STATUS_CODES = new Set([404, 410]);

/** CLAUDE.md #10/notify design: a channel failure is recorded, never thrown — no personal data, no secrets. */
async function logNotifyFailure(entityId: string, message: string, channel: "push" | "mail" = "push"): Promise<void> {
  try {
    await insertAuditLog(db, {
      userId: null,
      action: "notify.failed",
      entity: "notify",
      entityId,
      oldValues: null,
      newValues: { channel, reason: message },
      createdAt: new Date(),
    });
  } catch (error) {
    // The audit write itself failed (e.g. the DB is down): never let a notification take anything else down with it.
    console.error("notify.failed could not be recorded", entityId, error);
  }
}

/** Which settings key (if any) holds this event's owner-alert email recipients. */
async function ownerEmailRecipients(event: NotifyEvent): Promise<string[]> {
  if (event.type === "new_wholesale_inquiry") return getNotifyOwnerWholesaleEmails();
  return getNotifyOwnerOrderEmails();
}

function orderNumberOf(event: NotifyEvent): string | null {
  return event.type === "new_wholesale_inquiry" ? null : event.orderNumber;
}

/** The owner's email alert (off by default for orders, ARCHITECTURE.md §4.2 step 10): same no-personal-data rule as push. */
async function dispatchOwnerEmail(event: NotifyEvent, title: string, url: string, entityId: string): Promise<void> {
  try {
    const recipients = await ownerEmailRecipients(event);
    if (recipients.length === 0) return;
    const store = await loadStore();
    const content = buildOwnerAlertEmail({ title, orderNumber: orderNumberOf(event), url, store });
    await sendMail({ to: recipients.join(","), ...content });
  } catch (error) {
    await logNotifyFailure(entityId, error instanceof Error ? error.message : "Unknown error", "mail");
  }
}

/** Sends to every subscription, deleting the stale ones and logging any other failure. Never throws. */
async function dispatchPush(subscriptions: StoredSubscription[], payload: unknown, entityId: string): Promise<void> {
  for (const subscription of subscriptions) {
    try {
      const result = await sendPush(subscription, payload);
      if (result.ok) {
        await touchSubscription(subscription.id);
      } else if (result.statusCode !== undefined && STALE_STATUS_CODES.has(result.statusCode)) {
        await deleteSubscriptionById(subscription.id);
      } else {
        await logNotifyFailure(entityId, result.message);
      }
    } catch (error) {
      await logNotifyFailure(entityId, error instanceof Error ? error.message : "Unknown error");
    }
  }
}

/** The event senders below are what the app layer fires with `after()` — they must never throw. */
async function sendEvent(event: NotifyEvent, permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS], entityId: string): Promise<void> {
  let payload: ReturnType<typeof buildPushPayload>;
  try {
    payload = buildPushPayload(event);
    const subscriptions = await listSubscriptionsForPermission(permission);
    await dispatchPush(subscriptions, payload, entityId);
  } catch (error) {
    await logNotifyFailure(entityId, error instanceof Error ? error.message : "Unknown error");
    return;
  }
  // Push is always attempted; the owner's email is an opt-in backup (ARCHITECTURE.md §4.2 step 10).
  await dispatchOwnerEmail(event, payload.title, payload.url, entityId);
}

/**
 * Fired from the app layer with `after()` (ARCHITECTURE.md §4.2 step 10): never inside the
 * order's transaction, never awaited by the customer's action. Reaches every active user holding
 * `order.view`.
 */
export async function notifyNewOrder(orderNumber: string, paymentMethod: PaymentMethod): Promise<void> {
  await sendEvent({ type: "new_order", orderNumber, paymentMethod }, PERMISSIONS.ORDER_VIEW, orderNumber);
}

/** Fired only for the delivery-charge screenshot, never the checkout one (BUILD_PLAN.md S21). */
export async function notifyDeliveryScreenshotUploaded(orderNumber: string): Promise<void> {
  await sendEvent({ type: "delivery_screenshot_uploaded", orderNumber }, PERMISSIONS.ORDER_VIEW, orderNumber);
}

/** Fired once a real (non-honeypot) inquiry is stored (S17); the id gives the push a unique tag and URL. */
export async function notifyWholesaleInquiry(inquiryId: number): Promise<void> {
  await sendEvent({ type: "new_wholesale_inquiry", inquiryId }, PERMISSIONS.WHOLESALE_VIEW, `wholesale-${inquiryId}`);
}

/** Panel bell: "Enable notifications" (ARCHITECTURE.md §9). Only `order.view` holders may call this (the route checks). */
export async function subscribe(userId: number, input: PushSubscribeInput, userAgent: string | null): Promise<void> {
  await upsertSubscription({ userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent });
}

export async function unsubscribe(userId: number, endpoint: string): Promise<void> {
  await deleteSubscription(userId, endpoint);
}

type TestNotificationResult = { ok: true; sent: number } | { ok: false; error: string };

/** "Send test notification" in the bell's menu: only to this user's own devices. */
export async function sendTestNotification(userId: number): Promise<TestNotificationResult> {
  const subscriptions = await listSubscriptionsForUser(userId);
  if (subscriptions.length === 0) return { ok: false, error: "Enable notifications on this device first." };
  // `type: "test"` (S22 follow-up) is also one of the open tab's sound-worthy types, so this one
  // button proves both push delivery and the chime at once.
  const payload = { type: "test", title: "Test notification", body: "Push notifications are working.", url: new URL("/panel", env.APP_URL).toString(), tag: "test" };
  await dispatchPush(subscriptions, payload, `user:${userId}`);
  return { ok: true, sent: subscriptions.length };
}
