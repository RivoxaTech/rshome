import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { checkProductImport, MAX_IMPORT_FILE_BYTES } from "@/features/catalog/csv-import-service";
import { authorizeRequest } from "@/server/auth/permissions";
import { isAllowedOrigin, readFormFile } from "@/server/request";

/**
 * Step a of the product CSV import (S18): parses and validates the whole file and returns a
 * report, writing nothing. A Route Handler, not a Server Action — Server Actions cap their body at
 * 1MB by default and the file can be up to 2MB (same reasoning as `/api/panel/uploads`).
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ ok: false, error: "This request is not allowed." }, { status: 403 });

  const auth = await authorizeRequest(PERMISSIONS.PRODUCT_IMPORT);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "This request is not allowed." }, { status: auth.status });

  const file = await readFormFile(request, "file");
  if (!file) return NextResponse.json({ ok: false, error: "Choose a CSV file first." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "The file is larger than 2 MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await checkProductImport(buffer);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
