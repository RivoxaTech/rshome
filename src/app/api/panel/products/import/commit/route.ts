import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { commitProductImport, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_FILE_NAME_LENGTH } from "@/features/catalog/csv-import-service";
import { authorizeRequest } from "@/server/auth/permissions";
import { isAllowedOrigin } from "@/server/request";

/**
 * Step b of the product CSV import (S18): re-validates the identical file and token fresh and, only
 * when there are zero errors, writes every product/variant in one transaction. The file is the
 * same one "Check file" hashed — never trusted from the client's report alone.
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ ok: false, error: "This request is not allowed." }, { status: 403 });

  const auth = await authorizeRequest(PERMISSIONS.PRODUCT_IMPORT);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "This request is not allowed." }, { status: auth.status });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const token = formData?.get("token");
  const fileNameField = formData?.get("fileName");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a CSV file first." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "The file is larger than 2 MB." }, { status: 400 });
  }
  if (typeof token !== "string" || !token) return NextResponse.json({ ok: false, error: "Check the file first." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  // Display text for the audit row only (S22 BUG-03): trimmed and capped, never a storage key.
  const fileName = (typeof fileNameField === "string" && fileNameField.trim() ? fileNameField : file.name).trim().slice(0, MAX_IMPORT_FILE_NAME_LENGTH) || "import.csv";
  const result = await commitProductImport(buffer, token, { id: auth.session.id }, fileName);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
