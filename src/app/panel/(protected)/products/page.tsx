import { PanelPage } from "@/components/panel/PanelPage";
import { requirePermission } from "@/server/auth/permissions";
import { PERMISSIONS } from "@/features/auth/permissions";

// Stub pending S10 (products CRUD). Gated on product.create as an interim RBAC canary;
// S10 should split this into product.view (Admin, read-only) and product.create/update/delete (Developer).
export default async function ProductsPage() {
  await requirePermission(PERMISSIONS.PRODUCT_CREATE);

  return (
    <PanelPage crumbs={[{ label: "Products" }]}>
      <p className="text-muted-foreground text-[13px]">Catalogue management arrives in slice S10.</p>
    </PanelPage>
  );
}
