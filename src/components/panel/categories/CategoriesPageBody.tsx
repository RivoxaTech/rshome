import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { Pagination } from "@/components/panel/Pagination";
import { RowsPerPageSelect } from "@/components/panel/RowsPerPageSelect";
import { SearchBox } from "@/components/panel/SearchBox";
import { buildListPath } from "@/components/panel/list-path";
import { CategoriesTable } from "@/components/panel/categories/CategoriesTable";
import { CategoriesTableSkeleton } from "@/components/panel/categories/CategoriesTableSkeleton";
import { PERMISSIONS } from "@/features/auth/permissions";
import { CATEGORY_DEFAULT_PAGE_SIZE, CATEGORY_PAGE_SIZE_OPTIONS, categoryListQuerySchema, type CategoryListQuery } from "@/features/catalog/schemas";
import { listStaffCategories } from "@/features/catalog/staff-service";
import { requirePermission } from "@/server/auth/permissions";

const BASE_PATH = "/panel/categories";

function categoriesPath(query: { q?: string; page?: number; pageSize?: number }): string {
  return buildListPath(BASE_PATH, undefined, query, CATEGORY_DEFAULT_PAGE_SIZE);
}

/**
 * The table and its pagination in their own Suspense boundary (mirrors the orders/wholesale
 * lists, S9/S17): a search or page change only ever re-shows the skeleton for this part.
 */
async function CategoriesTableSection({ query, backHref }: { query: CategoryListQuery; backHref: string }) {
  await requirePermission(PERMISSIONS.CATEGORY_MANAGE);
  const { items, page, pageCount, total, pageSize } = await listStaffCategories({ q: query.q, page: query.page, pageSize: query.pageSize });
  if (query.page > 1 && query.page > pageCount) redirect(categoriesPath({ q: query.q, page: pageCount, pageSize: query.pageSize }));

  return (
    <>
      <CategoriesTable items={items} backHref={backHref} />
      <Pagination
        basePath={BASE_PATH}
        q={query.q}
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        defaultPageSize={CATEGORY_DEFAULT_PAGE_SIZE}
      />
    </>
  );
}

export async function CategoriesPageBody({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.CATEGORY_MANAGE);
  const query = categoryListQuerySchema.parse(searchParams);
  const backHref = categoriesPath({ q: query.q, page: query.page, pageSize: query.pageSize });

  return (
    <>
      <PanelPageTitle title="Categories" />
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:max-w-[320px] sm:flex-1">
            <SearchBox
              initialQ={query.q ?? ""}
              basePath={BASE_PATH}
              pageSize={query.pageSize}
              defaultPageSize={CATEGORY_DEFAULT_PAGE_SIZE}
              placeholder="Search categories"
              ariaLabel="Search categories"
            />
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <RowsPerPageSelect
              basePath={BASE_PATH}
              q={query.q}
              pageSize={query.pageSize}
              options={CATEGORY_PAGE_SIZE_OPTIONS}
              defaultPageSize={CATEGORY_DEFAULT_PAGE_SIZE}
            />
            <Link
              href={`/panel/categories/new?back=${encodeURIComponent(backHref)}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              New category
            </Link>
          </div>
        </div>
        <Suspense key={`${query.q ?? ""}-${query.page}-${query.pageSize}`} fallback={<CategoriesTableSkeleton />}>
          <CategoriesTableSection query={query} backHref={backHref} />
        </Suspense>
      </div>
    </>
  );
}
