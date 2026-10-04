import type { Metadata } from "next";
import { OrdersPageBody } from "@/components/panel/orders/OrdersPageBody";

export const metadata: Metadata = { title: "Orders – Bank transfer" };

export default async function BankOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <OrdersPageBody method="bank_transfer" searchParams={await searchParams} />;
}
