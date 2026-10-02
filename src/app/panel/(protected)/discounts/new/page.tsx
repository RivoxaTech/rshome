import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { DiscountForm } from "@/components/panel/discounts/DiscountForm";
import { PERMISSIONS } from "@/features/auth/permissions";
import { discountBackHrefSchema } from "@/features/discounts/schemas";
import { getDiscountFormOptions } from "@/features/discounts/staff-service";
import { utcToKarachiLocal } from "@/lib/karachi-datetime";
import { requirePermission } from "@/server/auth/permissions";
import { createDiscountAction } from "@/app/panel/(protected)/discounts/actions";

export default async function NewDiscountPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const { back } = await searchParams;
  const backHref = discountBackHrefSchema.parse(back) ?? "/panel/discounts";
  const { categories, products } = await getDiscountFormOptions();

  return (
    <>
      <PanelPageTitle title="New discount" />
      <PanelFormHeader title="New discount" backHref={backHref} backLabel="Back to discounts" />
      <DiscountForm
        mode="create"
        action={createDiscountAction}
        categories={categories}
        products={products}
        backHref={backHref}
        minDateTime={utcToKarachiLocal(new Date())}
        initial={{ id: null, name: "", type: "percent", value: "", targetType: "all", categoryId: null, productIds: [], startsAt: "", endsAt: "", isActive: true }}
      />
    </>
  );
}
