import { notFound } from "next/navigation";
import { PanelFormHeader } from "@/components/panel/PanelFormHeader";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { StatusPill } from "@/components/panel/StatusPill";
import { DeleteDiscountDialog } from "@/components/panel/discounts/DeleteDiscountDialog";
import { DiscountForm } from "@/components/panel/discounts/DiscountForm";
import { DiscountActiveToggle } from "@/components/panel/discounts/DiscountRowActions";
import { PERMISSIONS } from "@/features/auth/permissions";
import { discountBackHrefSchema } from "@/features/discounts/schemas";
import { getDiscountForEdit, getDiscountFormOptions } from "@/features/discounts/staff-service";
import { DISCOUNT_STATUS_COLORS, DISCOUNT_STATUS_LABELS } from "@/features/discounts/status";
import { utcToKarachiLocal } from "@/lib/karachi-datetime";
import { requirePermission } from "@/server/auth/permissions";
import { updateDiscountAction } from "@/app/panel/(protected)/discounts/actions";

export default async function EditDiscountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  await requirePermission(PERMISSIONS.DISCOUNT_MANAGE);
  const { id } = await params;
  const discountId = Number(id);
  if (!Number.isInteger(discountId) || discountId <= 0) notFound();

  const { back } = await searchParams;
  const backHref = discountBackHrefSchema.parse(back) ?? "/panel/discounts";

  const [formData, options] = await Promise.all([getDiscountForEdit(discountId), getDiscountFormOptions()]);
  if (!formData) notFound();
  const { discount, targetIds, status } = formData;

  return (
    <>
      <PanelPageTitle title={discount.name} />
      <PanelFormHeader title={discount.name} backHref={backHref} backLabel="Back to discounts">
        <StatusPill label={DISCOUNT_STATUS_LABELS[status]} colors={DISCOUNT_STATUS_COLORS[status]} />
      </PanelFormHeader>
      <DiscountForm
        // Remounts fresh when the row changes underneath it (the Activate/Deactivate quick action
        // saves without navigating away), so the controlled fields don't echo stale state.
        key={discount.updatedAt.getTime()}
        mode="edit"
        action={updateDiscountAction}
        categories={options.categories}
        products={options.products}
        backHref={backHref}
        minDateTime={utcToKarachiLocal(new Date())}
        initial={{
          id: discount.id,
          name: discount.name,
          type: discount.type,
          value: discount.value,
          targetType: discount.targetType,
          categoryId: discount.targetType === "category" ? (targetIds[0] ?? null) : null,
          productIds: discount.targetType === "product" ? targetIds : [],
          startsAt: discount.startsAt ? utcToKarachiLocal(discount.startsAt) : "",
          endsAt: discount.endsAt ? utcToKarachiLocal(discount.endsAt) : "",
          isActive: discount.isActive,
        }}
        actionsSlot={
          <div className="flex items-center gap-2">
            <DiscountActiveToggle id={discount.id} isActive={discount.isActive} variant="button" />
            <DeleteDiscountDialog id={discount.id} name={discount.name} />
          </div>
        }
      />
    </>
  );
}
