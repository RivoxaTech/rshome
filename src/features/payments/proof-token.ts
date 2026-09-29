/**
 * The checkout upload token (ARCHITECTURE.md §4.4), pure so it's unit-tested. A bank-transfer
 * screenshot is uploaded before its order exists, so the upload route hands back this token
 * naming the pending file, and `createOrder` accepts the file only with a valid, unexpired
 * token: a base64url JSON payload plus an HMAC-SHA256 signature under `SESSION_SECRET`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const PROOF_TOKEN_TTL_MS = 60 * 60 * 1000;

// The order-access cookie is signed with the same secret: signing under a label keeps a value
// of one kind from ever passing as the other.
const LABEL = "checkout-proof";

const payloadSchema = z.object({
  f: z.string().regex(/^[a-f0-9]{32}$/),
  e: z.number().int(),
});

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${LABEL}.${body}`).digest("base64url");
}

export function encodeProofToken(fileName: string, expiresAt: Date, secret: string): string {
  const body = Buffer.from(JSON.stringify({ f: fileName, e: expiresAt.getTime() })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The pending file a token names, or null when it is tampered with, malformed or expired. */
export function decodeProofToken(token: string, secret: string, now: Date): string | null {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    return payload.e > now.getTime() ? payload.f : null;
  } catch {
    return null;
  }
}
