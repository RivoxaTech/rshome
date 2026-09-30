import { OrdersPage } from "../orders-page";

export default function CodOrdersPage({ searchParams }: PageProps<"/panel/orders/cod">) {
  return <OrdersPage method="cod" searchParams={searchParams} />;
}
