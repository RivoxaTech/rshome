import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { Pagination } from "@/components/panel/Pagination";
import { RowsPerPageSelect } from "@/components/panel/RowsPerPageSelect";
import { SearchBox } from "@/components/panel/SearchBox";
import { buildListPath } from "@/components/panel/list-path";
import { UsersTable } from "@/components/panel/users/UsersTable";
import { UsersTableSkeleton } from "@/components/panel/users/UsersTableSkeleton";
import { PERMISSIONS } from "@/features/auth/permissions";
import { USER_DEFAULT_PAGE_SIZE, USER_PAGE_SIZE_OPTIONS, userListQuerySchema, type UserListQuery } from "@/features/users/schemas";
import { listStaffUsers } from "@/features/users/staff-service";
import { requirePermission } from "@/server/auth/permissions";

const BASE_PATH = "/panel/users";

function usersPath(query: { q?: string; page?: number; pageSize?: number }): string {
  return buildListPath(BASE_PATH, undefined, query, USER_DEFAULT_PAGE_SIZE);
}

/** The table and its pagination in their own Suspense boundary (mirrors the categories list): a search or page change only re-shows this part. */
async function UsersTableSection({ query, backHref }: { query: UserListQuery; backHref: string }) {
  const session = await requirePermission(PERMISSIONS.USER_MANAGE);
  const { items, page, pageCount, total, pageSize } = await listStaffUsers({ q: query.q, page: query.page, pageSize: query.pageSize });
  if (query.page > 1 && query.page > pageCount) redirect(usersPath({ q: query.q, page: pageCount, pageSize: query.pageSize }));

  return (
    <>
      <UsersTable items={items} viewerId={session.id} backHref={backHref} />
      <Pagination basePath={BASE_PATH} q={query.q} page={page} pageCount={pageCount} total={total} pageSize={pageSize} defaultPageSize={USER_DEFAULT_PAGE_SIZE} />
    </>
  );
}

export async function UsersPageBody({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.USER_MANAGE);
  const query = userListQuerySchema.parse(searchParams);
  const backHref = usersPath({ q: query.q, page: query.page, pageSize: query.pageSize });

  return (
    <>
      <PanelPageTitle title="Users" />
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:max-w-[320px] sm:flex-1">
            <SearchBox initialQ={query.q ?? ""} basePath={BASE_PATH} pageSize={query.pageSize} defaultPageSize={USER_DEFAULT_PAGE_SIZE} placeholder="Search by name or email" ariaLabel="Search users" />
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <RowsPerPageSelect basePath={BASE_PATH} q={query.q} pageSize={query.pageSize} options={USER_PAGE_SIZE_OPTIONS} defaultPageSize={USER_DEFAULT_PAGE_SIZE} />
            <Link
              href={`/panel/users/new?back=${encodeURIComponent(backHref)}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              New user
            </Link>
          </div>
        </div>
        <Suspense key={`${query.q ?? ""}-${query.page}-${query.pageSize}`} fallback={<UsersTableSkeleton />}>
          <UsersTableSection query={query} backHref={backHref} />
        </Suspense>
      </div>
    </>
  );
}
