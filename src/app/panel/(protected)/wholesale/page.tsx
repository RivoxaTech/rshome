import { WholesalePageBody } from "@/components/panel/wholesale/WholesalePageBody";

export default async function WholesalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WholesalePageBody searchParams={await searchParams} />;
}
