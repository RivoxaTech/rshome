import { AuditPageBody } from "@/components/panel/audit/AuditPageBody";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AuditPageBody searchParams={await searchParams} />;
}
