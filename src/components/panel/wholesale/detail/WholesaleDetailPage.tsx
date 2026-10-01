import { notFound } from "next/navigation";
import { PERMISSIONS } from "@/features/auth/permissions";
import { backHrefSchema } from "@/features/wholesale/schemas";
import { getStaffWholesaleInquiry } from "@/features/wholesale/staff-service";
import { wholesalePath } from "@/features/wholesale/transitions";
import { requirePermission } from "@/server/auth/permissions";
import { WholesaleDetailView } from "./WholesaleDetailView";

export async function WholesaleDetailPage({ id, back }: { id: number; back?: string }) {
  const session = await requirePermission(PERMISSIONS.WHOLESALE_VIEW);
  const inquiry = await getStaffWholesaleInquiry(id, session.permissions);
  if (!inquiry) notFound();

  const backHref = backHrefSchema.parse(back) ?? wholesalePath();
  return <WholesaleDetailView inquiry={inquiry} backHref={backHref} />;
}
