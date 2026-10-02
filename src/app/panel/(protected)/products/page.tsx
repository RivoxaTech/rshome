import { ProductsPageBody } from "@/components/panel/products/ProductsPageBody";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ProductsPageBody searchParams={await searchParams} />;
}
