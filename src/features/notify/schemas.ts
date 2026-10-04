import "@/lib/zod-config";
import { z } from "zod";

/** `localhost`, `*.localhost`, an IPv4 literal or a bracketed IPv6 literal: never a push service. */
function isLocalOrLiteralHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith("[");
}

/**
 * A push service endpoint (S22 SEC-04): every browser push service is an `https://` host name, so
 * anything else is a crafted request that would make the server POST to an arbitrary address.
 */
const pushEndpointSchema = z
  .url()
  .max(500)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !isLocalOrLiteralHost(url.hostname);
  }, "Invalid subscription.");

/** What the browser's `PushSubscription.toJSON()` sends to `/api/push/subscribe`. */
export const pushSubscribeSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(191),
    auth: z.string().min(1).max(191),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url().max(500),
});
