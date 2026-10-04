import { AuditTableSkeleton } from "@/components/panel/audit/AuditSkeleton";

/** The Suspense fallback for the audit table alone (the filters stay on screen behind it). */
export function AuditSkeletonBoundary() {
  return <AuditTableSkeleton />;
}
