import { OrdersPage } from "../orders-page";

export default function BankOrdersPage({ searchParams }: PageProps<"/panel/orders/bank">) {
  return <OrdersPage method="bank_transfer" searchParams={searchParams} />;
}
