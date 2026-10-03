import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderSlipView } from "@/components/panel/orders/slip/OrderSlipView";
import { PERMISSIONS } from "@/features/auth/permissions";
import { getStaffOrder } from "@/features/orders/staff-service";
import { getContactInfo, getStoreIdentity } from "@/features/settings/service";
import { requirePermission } from "@/server/auth/permissions";

type Params = { orderNumber: string };

/** A descriptive tab/print-header title (the browser's own print header shows the page `<title>`), rather than the site-wide default. */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Packing slip — ${orderNumber}` };
}

/**
 * The printable packing slip (S18, order keys only): deliberately outside the `(protected)` route
 * group so it never gets the panel's sidebar/header chrome — its own minimal page, auth-checked
 * here directly since no ancestor layout does it for this path. `?autoprint=1` (the order detail
 * page's "Print slip" link) opens the print dialog as soon as the page renders; a plain visit to
 * this URL never auto-prints.
 */
export default async function OrderSlipPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderNumber } = await params;
  const { autoprint } = await searchParams;
  const session = await requirePermission(PERMISSIONS.ORDER_VIEW);
  const order = await getStaffOrder(orderNumber, session.permissions);
  if (!order) notFound();

  const [identity, contact] = await Promise.all([getStoreIdentity(), getContactInfo()]);

  return (
    <OrderSlipView
      order={order}
      storeName={identity.storeName}
      contactPhone={contact.phone}
      contactAddress={contact.address}
      autoPrint={autoprint === "1"}
    />
  );
}
