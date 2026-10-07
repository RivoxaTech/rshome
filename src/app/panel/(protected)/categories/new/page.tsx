import type { Metadata } from "next";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { CategoryForm } from "@/components/panel/categories/CategoryForm";
import { CategoryFormHeader } from "@/components/panel/categories/CategoryFormHeader";
import { PERMISSIONS } from "@/features/auth/permissions";
import { categoryBackHrefSchema } from "@/features/catalog/schemas";
import { getCategoryFormDataForCreate } from "@/features/catalog/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { createCategoryAction } from "@/app/panel/(protected)/categories/actions";

export const metadata: Metadata = { title: "New category" };

export default async function NewCategoryPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  await requirePermission(PERMISSIONS.CATEGORY_MANAGE);
  const { back } = await searchParams;
  const backHref = categoryBackHrefSchema.parse(back) ?? "/panel/categories";
  const { parentOptions } = await getCategoryFormDataForCreate();

  return (
    <>
      <PanelPageTitle title="New category" />
      <CategoryFormHeader title="New category" backHref={backHref} />
      <CategoryForm
        mode="create"
        action={createCategoryAction}
        parentOptions={parentOptions}
        hasChildren={false}
        backHref={backHref}
        initial={{ id: null, name: "", slug: "", description: null, imagePath: null, sortOrder: 0, isActive: true, showOnHomepage: true, parentId: null }}
      />
    </>
  );
}
