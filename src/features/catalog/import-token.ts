/**
 * The product CSV import's check token (S18), modelled directly on
 * `features/payments/proof-token.ts`: a base64url JSON payload plus an HMAC-SHA256 signature
 * under `SESSION_SECRET`. "Check file" never stores the uploaded bytes server-side — the browser
 * re-submits the identical file for "Import N rows", and the server re-hashes it and compares
 * against the hash this token names, so step two can never be forged into importing a different
 * file than the one that was checked.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const IMPORT_CHECK_TOKEN_TTL_MS = 15 * 60 * 1000;

// Signing under a label keeps a value of one kind (an import check) from ever passing as another
// signed value (e.g. the checkout proof token), even though both use `SESSION_SECRET`.
const LABEL = "product-import-check";

const payloadSchema = z.object({
  h: z.string().regex(/^[a-f0-9]{64}$/),
  e: z.number().int(),
});

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${LABEL}.${body}`).digest("base64url");
}

export function hashFile(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function encodeImportCheckToken(fileHash: string, expiresAt: Date, secret: string): string {
  const body = Buffer.from(JSON.stringify({ h: fileHash, e: expiresAt.getTime() })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The file hash a token names, or null when it is tampered with, malformed or expired. */
export function decodeImportCheckToken(token: string, secret: string, now: Date): string | null {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    return payload.e > now.getTime() ? payload.h : null;
  } catch {
    return null;
  }
}
