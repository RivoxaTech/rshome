import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { buildProductImportTemplateCsv } from "@/features/catalog/csv-export";
import { authorizeRequest } from "@/server/auth/permissions";

/** The import page's downloadable template (S18): the export's own header plus one example row. */
export async function GET() {
  const auth = await authorizeRequest(PERMISSIONS.PRODUCT_IMPORT);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  return new NextResponse(buildProductImportTemplateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="product-import-template.csv"',
    },
  });
}
