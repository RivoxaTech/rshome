/**
 * The order-access cookie's value (ARCHITECTURE.md §4.5, D1), pure so it's unit-tested: a
 * base64url JSON payload of order numbers plus an expiry, signed with HMAC-SHA256. Granted by
 * placing an order or by a `/track` lookup; `order-access-cookie.ts` reads and writes the cookie.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ORDER_ACCESS_MAX_ORDERS = 20;
export const ORDER_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const payloadSchema = z.object({
  o: z.array(z.string().max(20)).max(ORDER_ACCESS_MAX_ORDERS),
  e: z.number().int(),
});

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function encodeOrderAccess(orderNumbers: string[], expiresAt: Date, secret: string): string {
  const body = Buffer.from(JSON.stringify({ o: orderNumbers, e: expiresAt.getTime() })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The order numbers a cookie value grants: none when it is missing, tampered with or expired. */
export function decodeOrderAccess(value: string | undefined, secret: string, now: Date): string[] {
  if (!value) return [];
  const [body, signature, ...rest] = value.split(".");
  if (!body || !signature || rest.length > 0) return [];

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return [];

  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    return payload.e > now.getTime() ? payload.o : [];
  } catch {
    return [];
  }
}

/** Newest first, no duplicates, at most `ORDER_ACCESS_MAX_ORDERS` (the oldest drop off). */
export function withOrderAccess(existing: string[], orderNumber: string): string[] {
  return [orderNumber, ...existing.filter((number) => number !== orderNumber)].slice(0, ORDER_ACCESS_MAX_ORDERS);
}
