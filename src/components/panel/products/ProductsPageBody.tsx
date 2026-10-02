import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { Pagination } from "@/components/panel/Pagination";
import { RowsPerPageSelect } from "@/components/panel/RowsPerPageSelect";
import { SearchBox } from "@/components/panel/SearchBox";
import { buildListPath } from "@/components/panel/list-path";
import { CategoryFilterSelect } from "@/components/panel/products/CategoryFilterSelect";
import { ProductTabs } from "@/components/panel/products/ProductTabs";
import { ProductsTable } from "@/components/panel/products/ProductsTable";
import { ProductsTableSkeleton } from "@/components/panel/products/ProductsTableSkeleton";
import { PERMISSIONS } from "@/features/auth/permissions";
import { listAllCategoriesForStaff } from "@/features/catalog/staff-repo";
import { PRODUCT_DEFAULT_PAGE_SIZE, PRODUCT_PAGE_SIZE_OPTIONS, productListQuerySchema, type ProductListQuery } from "@/features/catalog/schemas";
import { getProductStatusCounts, listStaffProducts } from "@/features/catalog/products-staff-service";
import { requirePermission } from "@/server/auth/permissions";

function productsPath(query: { tab?: string; q?: string; category?: string; page?: number; pageSize?: number }): string {
  return buildListPath("/panel/products", query.tab === "all" ? undefined : query.tab, query, PRODUCT_DEFAULT_PAGE_SIZE);
}

/**
 * The table and its pagination in their own Suspense boundary (mirrors the categories/wholesale
 * lists): a tab, search, category filter or page change only ever re-shows the skeleton here.
 */
async function ProductsTableSection({ query, backHref }: { query: ProductListQuery; backHref: string }) {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const { items, page, pageCount, total, pageSize } = await listStaffProducts(query.tab, {
    q: query.q,
    categoryId: query.category,
    page: query.page,
    pageSize: query.pageSize,
  });
  if (query.page > 1 && query.page > pageCount) {
    redirect(productsPath({ tab: query.tab, q: query.q, category: query.category ? String(query.category) : undefined, page: pageCount, pageSize: query.pageSize }));
  }

  return (
    <>
      <ProductsTable items={items} backHref={backHref} />
      <Pagination
        basePath="/panel/products"
        tabSlug={query.tab === "all" ? undefined : query.tab}
        q={query.q}
        category={query.category ? String(query.category) : undefined}
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        defaultPageSize={PRODUCT_DEFAULT_PAGE_SIZE}
      />
    </>
  );
}

export async function ProductsPageBody({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.PRODUCT_VIEW);
  const query = productListQuerySchema.parse(searchParams);
  const categoryParam = query.category ? String(query.category) : undefined;
  const backHref = productsPath({ tab: query.tab, q: query.q, category: categoryParam, page: query.page, pageSize: query.pageSize });

  const [counts, categories] = await Promise.all([getProductStatusCounts(), listAllCategoriesForStaff()]);

  return (
    <>
      <PanelPageTitle title="Products" />
      <div className="flex flex-col gap-2.5">
        <ProductTabs currentTab={query.tab} counts={counts} q={query.q} category={categoryParam} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:max-w-[480px]">
            <div className="min-w-0 flex-1">
              <SearchBox
                initialQ={query.q ?? ""}
                basePath="/panel/products"
                tabSlug={query.tab === "all" ? undefined : query.tab}
                category={categoryParam}
                pageSize={query.pageSize}
                defaultPageSize={PRODUCT_DEFAULT_PAGE_SIZE}
                placeholder="Search products"
                ariaLabel="Search products"
              />
            </div>
            <CategoryFilterSelect tab={query.tab} q={query.q} category={query.category} options={categories.map((category) => ({ id: category.id, name: category.name }))} />
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <RowsPerPageSelect
              basePath="/panel/products"
              tabSlug={query.tab === "all" ? undefined : query.tab}
              q={query.q}
              category={categoryParam}
              pageSize={query.pageSize}
              options={PRODUCT_PAGE_SIZE_OPTIONS}
              defaultPageSize={PRODUCT_DEFAULT_PAGE_SIZE}
            />
            <Link
              href="/panel/products/arrange"
              className="border-input hover:bg-secondary shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              Arrange products
            </Link>
            <Link
              href={`/panel/products/new?back=${encodeURIComponent(backHref)}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            >
              New product
            </Link>
          </div>
        </div>
        <Suspense key={`${query.tab}-${query.q ?? ""}-${categoryParam ?? ""}-${query.page}-${query.pageSize}`} fallback={<ProductsTableSkeleton />}>
          <ProductsTableSection query={query} backHref={backHref} />
        </Suspense>
      </div>
    </>
  );
}
