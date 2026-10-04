import { z } from "zod";

/**
 * Zod 4 compiles object parsers with `new Function` for speed and probes for it at first use.
 * The production CSP has no `'unsafe-eval'` (S22 SEC-02), so in the browser that probe is a
 * reported CSP violation on every storefront page — harmless, but noise that hides real problems.
 * `jitless` skips it everywhere. Every `features/*\/schemas.ts` imports this module first, so any
 * schema that reaches a client bundle is configured before it parses (`lib/zod-config.test.ts`).
 */
z.config({ jitless: true });
