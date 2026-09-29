"use server";

import { quoteCart, type CartQuoteResult } from "@/features/cart/service";
import { getClientIp } from "@/server/request";

/** The browser sends its stored cart (ids, quantities, coupon code); everything else is computed here. */
export async function quoteCartAction(input: unknown): Promise<CartQuoteResult> {
  const ip = await getClientIp();
  return quoteCart(input, { ip });
}
