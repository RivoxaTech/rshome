import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { ProductImportView } from "@/components/panel/products/ProductImportView";
import { PERMISSIONS } from "@/features/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";

export default async function ProductImportPage() {
  await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  return (
    <>
      <PanelPageTitle title="Import products" />
      <ProductImportView />
    </>
  );
}
