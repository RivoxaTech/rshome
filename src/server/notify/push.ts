import webpush from "web-push";
import { env } from "@/server/env";

let configured = false;

/** Configures the `web-push` library once, lazily, so a dev box without VAPID keys never crashes at import time. */
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type PushSendResult = { ok: true } | { ok: false; statusCode?: number; message: string };

/**
 * Every send is urgent (a staff member needs to see it now) and short-lived: a push the push
 * service couldn't deliver within a day is stale and should be dropped rather than queued.
 */
const SEND_OPTIONS = { TTL: 86400, urgency: "high" } as const;

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const value = (error as { statusCode: unknown }).statusCode;
  return typeof value === "number" ? value : undefined;
}

/**
 * One web-push send (server infra, CLAUDE.md §2: no feature knowledge, no DB). The caller
 * (`features/notify/service.ts`) decides what to do with a stale subscription (404/410) or any
 * other failure; this never throws.
 */
export async function sendPush(subscription: PushSubscriptionKeys, payload: unknown): Promise<PushSendResult> {
  if (!ensureConfigured()) return { ok: false, message: "VAPID keys are not configured." };
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      SEND_OPTIONS,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, statusCode: statusCodeOf(error), message: error instanceof Error ? error.message : "Unknown error" };
  }
}
