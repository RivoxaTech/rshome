import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { buildProductExportCsv } from "@/features/catalog/csv-export";
import { PRODUCT_TABS, type ProductTab } from "@/features/catalog/schemas";
import { KARACHI_OFFSET_MS } from "@/lib/karachi-datetime";
import { authorizeRequest } from "@/server/auth/permissions";

/** The products list's current filter as CSV (S18): same tab/search/category the page is showing. */
export async function GET(request: Request) {
  const auth = await authorizeRequest(PERMISSIONS.PRODUCT_EXPORT);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const url = new URL(request.url);
  const tabParam = url.searchParams.get("tab") ?? "";
  const tab: ProductTab = (PRODUCT_TABS as readonly string[]).includes(tabParam) ? (tabParam as ProductTab) : "all";
  const q = url.searchParams.get("q")?.trim().slice(0, 100) || undefined;
  const categoryParam = url.searchParams.get("category");
  const categoryId = categoryParam && /^\d+$/.test(categoryParam) ? Number(categoryParam) : undefined;

  const { csv, truncated } = await buildProductExportCsv({ tab, q, categoryId });
  // A Karachi date, and a visible mark when the row cap cut the export short (S22 BUG-25).
  const day = new Date(Date.now() + KARACHI_OFFSET_MS).toISOString().slice(0, 10);
  const filename = `products-${day}${truncated ? "-first-rows-only" : ""}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
