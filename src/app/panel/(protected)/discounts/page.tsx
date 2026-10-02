import { DiscountsPageBody } from "@/components/panel/discounts/DiscountsPageBody";

export default async function DiscountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <DiscountsPageBody searchParams={await searchParams} />;
}
