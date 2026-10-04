import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { Pagination } from "@/components/panel/Pagination";
import { RowsPerPageSelect } from "@/components/panel/RowsPerPageSelect";
import { buildListPath } from "@/components/panel/list-path";
import { AuditFilters } from "@/components/panel/audit/AuditFilters";
import { AuditSkeletonBoundary } from "@/components/panel/audit/AuditSkeletonBoundary";
import { AuditTable } from "@/components/panel/audit/AuditTable";
import { AUDIT_DEFAULT_PAGE_SIZE, AUDIT_PAGE_SIZE_OPTIONS, auditFilterParams, auditListQuerySchema, type AuditListQuery } from "@/features/audit/schemas";
import { listAuditActorOptions, listAuditLog } from "@/features/audit/staff-service";
import { PERMISSIONS } from "@/features/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";

const BASE_PATH = "/panel/audit";

/** The table and its pagination in their own Suspense boundary: a filter or page change only re-shows this part. */
async function AuditTableSection({ query }: { query: AuditListQuery }) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const extra = auditFilterParams(query);
  const { items, page, pageCount, total, pageSize } = await listAuditLog(query);
  if (query.page > 1 && query.page > pageCount) redirect(buildListPath(BASE_PATH, undefined, { page: pageCount, pageSize: query.pageSize, extra }, AUDIT_DEFAULT_PAGE_SIZE));

  return (
    <>
      <AuditTable items={items} />
      <Pagination basePath={BASE_PATH} page={page} pageCount={pageCount} total={total} pageSize={pageSize} defaultPageSize={AUDIT_DEFAULT_PAGE_SIZE} extra={extra} />
    </>
  );
}

export async function AuditPageBody({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const query = auditListQuerySchema.parse(searchParams);
  const actors = await listAuditActorOptions();
  const extra = auditFilterParams(query);

  return (
    <>
      <PanelPageTitle title="Audit log" />
      <div className="flex flex-col gap-2.5">
        <AuditFilters query={query} actors={actors} />
        <div className="flex items-center justify-end">
          <RowsPerPageSelect basePath={BASE_PATH} pageSize={query.pageSize} options={AUDIT_PAGE_SIZE_OPTIONS} defaultPageSize={AUDIT_DEFAULT_PAGE_SIZE} extra={extra} />
        </div>
        <Suspense key={JSON.stringify([extra, query.page, query.pageSize])} fallback={<AuditSkeletonBoundary />}>
          <AuditTableSection query={query} />
        </Suspense>
      </div>
    </>
  );
}
