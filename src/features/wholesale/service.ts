import { features } from "@/config/features";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { consumeRateLimit } from "@/server/rate-limit";
import { createInquiry } from "./repo";
import { wholesaleInquiryInputSchema } from "./schemas";

const WHOLESALE_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

export type CreateWholesaleInquiryResult =
  // `notify` is false for the honeypot path: the caller must still answer success, but fires no
  // push or email for it ("looks successful, stores nothing, notifies nobody"); `id` is the new
  // row's id when one was created (null for the honeypot path), for the caller to pass to
  // `notifyWholesaleInquiry` — never returned to the browser beyond a plain `{ok:true}`.
  | { ok: true; notify: boolean; id: number | null }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * The storefront wholesale form (REQUIREMENTS SF-08): rate limit, then validate, then the
 * honeypot check, then store. A non-empty `website` field means a bot filled every input — answer
 * with the same success shape as a real submission, but write nothing and notify nobody.
 */
export async function createWholesaleInquiry(rawInput: unknown, ctx: { ip: string }): Promise<CreateWholesaleInquiryResult> {
  // Defence in depth: the storefront page also 404s when the flag is off, but a direct Server
  // Action call (bypassing the UI) must be refused here too.
  if (!features.wholesale) return { ok: false, error: "Wholesale inquiries aren't available right now." };

  const limit = await consumeRateLimit(`wholesale:ip:${ctx.ip}`, WHOLESALE_RATE_LIMIT);
  if (!limit.allowed) return { ok: false, error: "Too many attempts. Please try again in a few minutes." };

  const parsed = wholesaleInquiryInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error) };
  const input = parsed.data;

  if (input.website) return { ok: true, notify: false, id: null };

  const id = await createInquiry(input);
  return { ok: true, notify: true, id };
}
