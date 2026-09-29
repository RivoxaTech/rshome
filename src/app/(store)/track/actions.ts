"use server";

import { redirect } from "next/navigation";
import { grantOrderAccess } from "@/features/checkout/order-access-cookie";
import { trackOrder } from "@/features/orders/service";
import { getClientIp } from "@/server/request";

export type TrackActionState = { error: string } | undefined;

export async function trackOrderAction(_prevState: TrackActionState, formData: FormData): Promise<TrackActionState> {
  const ip = await getClientIp();
  const result = await trackOrder({ orderNumber: formData.get("orderNumber"), phone: formData.get("phone") }, { ip });
  if (!result.ok) return { error: result.error };

  await grantOrderAccess(result.orderNumber);
  redirect(`/order/${result.orderNumber}`);
}
