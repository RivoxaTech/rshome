/**
 * The production HTTP security headers (S22, ARCHITECTURE.md D61), applied to every route by
 * `next.config.ts`'s `headers()`. Pure data, so `security-headers.test.ts` can pin each directive.
 *
 * Why this CSP and not a stricter one: Next's App Router streams inline bootstrap scripts, so
 * without a per-request nonce (which needs a `proxy.ts`, ruled out by D18) `script-src` must allow
 * `'unsafe-inline'`; `next/image` and a few components set dynamic `style=` attributes, so
 * `style-src` does too. The rest is tight: no third-party script, style, font, frame or
 * connection is ever loaded, nothing may frame the site, forms post only to this origin.
 *
 * What each allowance is for: `img-src blob:` is the payment-screenshot preview
 * (`URL.createObjectURL` in `components/store/orders/ProofUpload.tsx`); `worker-src 'self'` is the
 * panel's push service worker (`public/sw.js`); fonts are self-hosted by `next/font`; `wa.me` and
 * `mailto:` links are navigations, which CSP does not govern. HSTS is ignored over plain HTTP, so
 * it is safe to send everywhere; `includeSubDomains` is deliberately left out (owner decision).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** 180 days; no `includeSubDomains`, no `preload` (owner decision, S22). */
export const STRICT_TRANSPORT_SECURITY = "max-age=15552000";

export type HeaderEntry = { key: string; value: string };

export const SECURITY_HEADERS: readonly HeaderEntry[] = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: STRICT_TRANSPORT_SECURITY },
];
