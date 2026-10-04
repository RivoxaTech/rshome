import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WholesaleDetailPage } from "@/components/panel/wholesale/detail/WholesaleDetailPage";

export const metadata: Metadata = { title: "Wholesale inquiry" };

export default async function WholesaleInquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { id } = await params;
  const { back } = await searchParams;
  const inquiryId = Number(id);
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) notFound();
  return <WholesaleDetailPage id={inquiryId} back={back} />;
}
