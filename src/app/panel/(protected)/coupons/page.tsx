import { CouponsPageBody } from "@/components/panel/coupons/CouponsPageBody";

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CouponsPageBody searchParams={await searchParams} />;
}
