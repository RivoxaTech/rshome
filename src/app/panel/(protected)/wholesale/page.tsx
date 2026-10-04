import type { Metadata } from "next";
import { WholesalePageBody } from "@/components/panel/wholesale/WholesalePageBody";

export const metadata: Metadata = { title: "Wholesale inquiries" };

export default async function WholesalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WholesalePageBody searchParams={await searchParams} />;
}
