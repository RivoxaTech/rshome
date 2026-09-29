/**
 * The idempotency token for one checkout attempt (ARCHITECTURE.md D11). Kept in sessionStorage so
 * a resubmit after a lost response (reload, flaky network) returns the same order instead of
 * creating a second one; cleared once an order is placed.
 */
const STORAGE_KEY = "checkout.token";

function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Plain-http hosts (a LAN demo) have no randomUUID: build a v4 UUID from getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getCheckoutToken(): string {
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // Storage blocked: a fresh token per submit still works, it just can't survive a reload.
  }
  const token = randomUuid();
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // As above.
  }
  return token;
}

export function clearCheckoutToken(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
