import { cookies } from "next/headers";
import { env } from "@/server/env";
import { ORDER_ACCESS_TTL_MS, decodeOrderAccess, encodeOrderAccess, withOrderAccess } from "./order-access";

export const ORDER_ACCESS_COOKIE = "order_access";

/** Order numbers this browser may open (empty when there is no valid cookie). */
export async function getAccessibleOrderNumbers(): Promise<string[]> {
  const cookieStore = await cookies();
  return decodeOrderAccess(cookieStore.get(ORDER_ACCESS_COOKIE)?.value, env.SESSION_SECRET, new Date());
}

export async function hasOrderAccess(orderNumber: string): Promise<boolean> {
  return (await getAccessibleOrderNumbers()).includes(orderNumber);
}

/** Adds an order to the cookie. Must run in a Server Action or Route Handler (cookies can't be set while rendering). */
export async function grantOrderAccess(orderNumber: string): Promise<void> {
  const current = await getAccessibleOrderNumbers();
  const expiresAt = new Date(Date.now() + ORDER_ACCESS_TTL_MS);
  const cookieStore = await cookies();
  cookieStore.set(ORDER_ACCESS_COOKIE, encodeOrderAccess(withOrderAccess(current, orderNumber), expiresAt, env.SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
