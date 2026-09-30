import { notFound } from "next/navigation";
import { OrderDetailView } from "@/components/panel/orders/detail/OrderDetailView";
import { PERMISSIONS } from "@/features/auth/permissions";
import { backHrefSchema } from "@/features/orders/schemas";
import { getStaffOrder } from "@/features/orders/staff-service";
import { requirePermission } from "@/server/auth/permissions";

/** The detail page (C21): back link to the exact tab/search/page it came from, falling back to the order's own tab. */
export async function OrderDetailPage({
  orderNumber,
  back,
}: {
  orderNumber: string;
  back: string | string[] | undefined;
}) {
  const session = await requirePermission(PERMISSIONS.ORDER_VIEW);
  const order = await getStaffOrder(orderNumber, session.permissions);
  if (!order) notFound();
  const backHref = backHrefSchema.parse(back) ?? order.homeList;

  return <OrderDetailView order={order} backHref={backHref} />;
}
