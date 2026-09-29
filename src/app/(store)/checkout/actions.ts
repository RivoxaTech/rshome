"use server";

import { grantOrderAccess } from "@/features/checkout/order-access-cookie";
import { createOrder, type CreateOrderResult } from "@/features/checkout/service";
import { getClientIp } from "@/server/request";

/** Places the order and, on success, lets this browser open its order page (ARCHITECTURE.md D1). */
export async function createOrderAction(input: unknown): Promise<CreateOrderResult> {
  const ip = await getClientIp();
  const result = await createOrder(input, { ip });
  if (result.ok) await grantOrderAccess(result.orderNumber);
  return result;
}
