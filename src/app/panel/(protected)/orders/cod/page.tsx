import type { Metadata } from "next";
import { OrdersPageBody } from "@/components/panel/orders/OrdersPageBody";

export const metadata: Metadata = { title: "Orders – Cash on delivery" };

export default async function CodOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <OrdersPageBody method="cod" searchParams={await searchParams} />;
}
