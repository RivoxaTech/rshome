import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { ArchiveRestoreButton } from "@/components/panel/products/ProductRowActions";
import { DeleteProductDialog } from "@/components/panel/products/DeleteProductDialog";
import { ProductForm } from "@/components/panel/products/ProductForm";
import { ProductFormHeader } from "@/components/panel/products/ProductFormHeader";
import { VariantsSection } from "@/components/panel/products/variants/VariantsSection";
import { ImagesSection } from "@/components/panel/products/images/ImagesSection";
import { PERMISSIONS } from "@/features/auth/permissions";
import { productBackHrefSchema } from "@/features/catalog/schemas";
import { checkProductDeletable, getActiveCategoryGroups, getProductForEdit } from "@/features/catalog/products-staff-readers";
import { requirePermission } from "@/server/auth/permissions";
import { updateProductAction } from "@/app/panel/(protected)/products/actions";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  const { back } = await searchParams;
  const backHref = productBackHrefSchema.parse(back) ?? "/panel/products";

  const formData = await getProductForEdit(productId);
  if (!formData) notFound();
  const { product, variants, images, salePrice, shopPosition, shopTotal, featuredPosition, featuredTotal } = formData;

  const [categoryGroups, deleteGuard] = await Promise.all([getActiveCategoryGroups(product.categoryId), checkProductDeletable(productId)]);

  return (
    <>
      <PanelPageTitle title={product.name} />
      <ProductFormHeader title={product.name} backHref={backHref} salePrice={salePrice} variantCount={variants.length} />
      <ProductForm
        // Remounts fresh whenever the row changes underneath it (e.g. the delete dialog's "Archive
        // instead" updates the status without navigating away) — otherwise the controlled fields'
        // local state would keep echoing what was on screen before that background save.
        key={product.updatedAt.getTime()}
        mode="edit"
        action={updateProductAction}
        categoryGroups={categoryGroups}
        defaultVariant={null}
        shopPosition={{ current: shopPosition, total: shopTotal }}
        featuredPosition={{ current: featuredPosition, total: featuredTotal }}
        backHref={backHref}
        initial={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          shortDescription: product.shortDescription,
          description: product.description,
          price: product.price,
          weightGrams: product.weightGrams,
          status: product.status,
          isFeatured: product.isFeatured,
          imagePath: null,
          imageWidth: null,
          imageHeight: null,
        }}
        actionsSlot={
          <div className="flex items-center gap-2">
            <ArchiveRestoreButton id={product.id} status={product.status} variant="button" />
            <DeleteProductDialog id={product.id} guard={deleteGuard} />
          </div>
        }
      />

      {/* Both below and outside the save form: every control in them is a `<form>` of its own (D49, D53, D54). */}
      <div className="mt-6 flex flex-col gap-6">
        <VariantsSection product={{ id: product.id, name: product.name, price: product.price, status: product.status }} variants={variants} />
        <ImagesSection productId={product.id} images={images} />
      </div>
    </>
  );
}
