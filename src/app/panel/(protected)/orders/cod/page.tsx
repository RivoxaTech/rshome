import { OrdersPageBody } from "@/components/panel/orders/OrdersPageBody";

export default async function CodOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <OrdersPageBody method="cod" searchParams={await searchParams} />;
}
