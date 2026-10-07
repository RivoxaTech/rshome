import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { CategoryForm } from "@/components/panel/categories/CategoryForm";
import { CategoryFormHeader } from "@/components/panel/categories/CategoryFormHeader";
import { DeleteCategoryDialog } from "@/components/panel/categories/DeleteCategoryDialog";
import { PERMISSIONS } from "@/features/auth/permissions";
import { categoryBackHrefSchema } from "@/features/catalog/schemas";
import { checkCategoryDeletable, getCategoryForEdit } from "@/features/catalog/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { updateCategoryAction } from "@/app/panel/(protected)/categories/actions";

export const metadata: Metadata = { title: "Edit category" };

export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  await requirePermission(PERMISSIONS.CATEGORY_MANAGE);
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) notFound();

  const { back } = await searchParams;
  const backHref = categoryBackHrefSchema.parse(back) ?? "/panel/categories";

  // Two independent reads, in parallel (the other edit pages already do this; found in the S20 dev-speed pass).
  const [formData, deleteGuard] = await Promise.all([getCategoryForEdit(categoryId), checkCategoryDeletable(categoryId)]);
  if (!formData) notFound();
  const { category, parentOptions, hasChildren } = formData;

  return (
    <>
      <PanelPageTitle title={category.name} />
      <CategoryFormHeader title={category.name} backHref={backHref} />
      <CategoryForm
        mode="edit"
        action={updateCategoryAction}
        parentOptions={parentOptions}
        hasChildren={hasChildren}
        backHref={backHref}
        initial={{
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          imagePath: category.imagePath,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
          showOnHomepage: category.showOnHomepage,
          parentId: category.parentId,
        }}
        deleteSlot={<DeleteCategoryDialog id={category.id} guard={deleteGuard} />}
      />
    </>
  );
}
