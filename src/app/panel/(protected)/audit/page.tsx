import type { Metadata } from "next";
import { AuditPageBody } from "@/components/panel/audit/AuditPageBody";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AuditPageBody searchParams={await searchParams} />;
}
