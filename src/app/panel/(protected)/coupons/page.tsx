import type { Metadata } from "next";
import { CouponsPageBody } from "@/components/panel/coupons/CouponsPageBody";

export const metadata: Metadata = { title: "Coupons" };

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CouponsPageBody searchParams={await searchParams} />;
}
