import { createHash } from "node:crypto";

/**
 * A short, stable digest of a row's content, for optimistic-concurrency tokens (S14). `updated_at`
 * alone is a second-precision DATETIME, so two saves inside one second would share it; pairing it
 * with what the editor actually saw makes a stale edit detectable whenever the row differs.
 */
export function fingerprint(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}
