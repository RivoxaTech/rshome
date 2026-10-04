import type { Metadata } from "next";
import { ProductsPageBody } from "@/components/panel/products/ProductsPageBody";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ProductsPageBody searchParams={await searchParams} />;
}
