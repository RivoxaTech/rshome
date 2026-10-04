import type { Metadata } from "next";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { ProductForm } from "@/components/panel/products/ProductForm";
import { ProductFormHeader } from "@/components/panel/products/ProductFormHeader";
import { PERMISSIONS } from "@/features/auth/permissions";
import { productBackHrefSchema } from "@/features/catalog/schemas";
import { getActiveCategoryGroups, getPlacementTotals } from "@/features/catalog/products-staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { createProductAction } from "@/app/panel/(protected)/products/actions";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  await requirePermission(PERMISSIONS.PRODUCT_CREATE);
  const { back } = await searchParams;
  const backHref = productBackHrefSchema.parse(back) ?? "/panel/products";
  const [categoryGroups, { shopTotal, featuredTotal }] = await Promise.all([getActiveCategoryGroups(), getPlacementTotals()]);

  return (
    <>
      <PanelPageTitle title="New product" />
      <ProductFormHeader title="New product" backHref={backHref} />
      <ProductForm
        mode="create"
        action={createProductAction}
        categoryGroups={categoryGroups}
        defaultVariant={{ sku: "", stock: 0 }}
        shopPosition={{ current: null, total: shopTotal }}
        featuredPosition={{ current: null, total: featuredTotal }}
        backHref={backHref}
        initial={{
          id: null,
          name: "",
          slug: "",
          categoryId: null,
          shortDescription: null,
          description: null,
          price: "",
          weightGrams: null,
          status: "draft",
          isFeatured: false,
          imagePath: null,
          imageWidth: null,
          imageHeight: null,
        }}
      />
    </>
  );
}
