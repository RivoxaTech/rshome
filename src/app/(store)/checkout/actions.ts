"use server";

import { after } from "next/server";
import { grantOrderAccess } from "@/features/checkout/order-access-cookie";
import { createOrder, type CreateOrderResult } from "@/features/checkout/service";
import { notifyNewOrder } from "@/features/notify/service";
import { getClientIp } from "@/server/request";

/**
 * Places the order and, on success, lets this browser open its order page (ARCHITECTURE.md D1).
 * The owner's new-order push (§4.2 step 10) fires after the response, only for a genuinely new
 * order (never an idempotent resubmit), and never blocks or fails this action.
 */
export async function createOrderAction(input: unknown): Promise<CreateOrderResult> {
  const ip = await getClientIp();
  const result = await createOrder(input, { ip });
  if (result.ok) {
    await grantOrderAccess(result.orderNumber);
    if (result.created) after(() => notifyNewOrder(result.orderNumber, result.paymentMethod));
  }
  return result;
}
