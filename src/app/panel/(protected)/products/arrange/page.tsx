import { z } from "zod";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { ProductFormHeader } from "@/components/panel/products/ProductFormHeader";
import { ArrangeTabs } from "@/components/panel/products/arrange/ArrangeTabs";
import { ArrangeCategoryFilter } from "@/components/panel/products/arrange/ArrangeCategoryFilter";
import { ArrangeList } from "@/components/panel/products/arrange/ArrangeList";
import { PERMISSIONS } from "@/features/auth/permissions";
import { getFeaturedArrangeList, getShopArrangeList } from "@/features/catalog/arrange-service";
import { listAllCategoriesForStaff } from "@/features/catalog/staff-repo";
import { requirePermission } from "@/server/auth/permissions";

const ARRANGE_TABS = ["shop", "featured"] as const;

const arrangeQuerySchema = z.object({
  tab: z.preprocess((value) => (Array.isArray(value) ? value[0] : value), z.enum(ARRANGE_TABS)).catch("shop"),
  category: z.preprocess((value) => (Array.isArray(value) ? value[0] : value), z.coerce.number().int().positive().optional()).catch(undefined),
});

export default async function ArrangeProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const query = arrangeQuerySchema.parse(await searchParams);

  const categories = query.tab === "shop" ? await listAllCategoriesForStaff() : [];
  const items = query.tab === "shop" ? await getShopArrangeList(query.category) : await getFeaturedArrangeList();

  return (
    <>
      <PanelPageTitle title="Arrange products" />
      <ProductFormHeader title="Arrange products" backHref="/panel/products" />
      <div className="flex flex-col gap-3">
        <ArrangeTabs currentTab={query.tab} category={query.category} />
        {query.tab === "shop" && (
          <ArrangeCategoryFilter category={query.category} options={categories.map((category) => ({ id: category.id, name: category.name }))} />
        )}
        <ArrangeList
          key={`${query.tab}-${query.category ?? "all"}`}
          scope={query.tab === "shop" ? { kind: "shop", categoryId: query.category } : { kind: "featured" }}
          items={items}
        />
      </div>
    </>
  );
}
