import { OrderDetailPage } from "@/components/panel/orders/detail/OrderDetailPage";

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
