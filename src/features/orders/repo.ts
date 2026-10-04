import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { orderItems, orders } from "@/server/db/schema/orders";

type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

export async function getOrderByNumber(orderNumber: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  return row;
}

/** The tracking lookup: both must match (`phone` normalised, as stored). */
export async function findOrderNumberByNumberAndPhone(orderNumber: string, phone: string): Promise<string | null> {
  const [row] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.phone, phone)))
    .limit(1);
  return row?.orderNumber ?? null;
}

export function getOrderItems(orderId: number): Promise<OrderItemRow[]> {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id));
}
