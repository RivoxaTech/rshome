"use server";

import { after } from "next/server";
import { notifyWholesaleInquiry } from "@/features/notify/service";
import { createWholesaleInquiry } from "@/features/wholesale/service";
import { getClientIp } from "@/server/request";

type WholesaleFormResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * The storefront wholesale form's submit (REQUIREMENTS SF-08). `result.notify` tells the honeypot
 * path apart from a real submission; it never reaches the browser, so a bot can't learn it was
 * caught from the response shape.
 */
export async function createWholesaleInquiryAction(input: unknown): Promise<WholesaleFormResult> {
  const ip = await getClientIp();
  const result = await createWholesaleInquiry(input, { ip });
  if (!result.ok) return result;
  const inquiryId = result.id;
  if (result.notify && inquiryId !== null) after(() => notifyWholesaleInquiry(inquiryId));
  return { ok: true };
}
