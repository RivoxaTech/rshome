import type { Metadata } from "next";
import { OrderDetailPage } from "@/components/panel/orders/detail/OrderDetailPage";

/** From the URL only (no query): a missing order still 404s in the page itself. */
export async function generateMetadata({ params }: { params: Promise<{ orderNumber: string }> }): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Order ${orderNumber}` };
}

export default async function CodOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderNumber } = await params;
  const { back } = await searchParams;
  return <OrderDetailPage orderNumber={orderNumber} back={back} />;
}
