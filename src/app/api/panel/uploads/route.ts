import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { authorizeRequest } from "@/server/auth/permissions";
import { isAllowedOrigin } from "@/server/request";
import { processMediaImage } from "@/server/storage/images";

// A generous cap for a hand-picked category/product photo, well under what sharp can decode
// safely (CLAUDE.md #11: no heavy work at request time, sharp already runs at concurrency 1).
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ALLOWED_SUBDIRS = new Set(["categories", "products"]);

/**
 * The panel's image upload (ARCHITECTURE.md's planned `api/panel/uploads/route.ts`, S10 phase 1:
 * category images; S10 phase 2 reuses it for product photos via `subdir`). A Route Handler, not a
 * Server Action, since Server Actions cap their body at 1MB by default (Next's own docs) and a
 * photo easily exceeds that; the create/edit form only ever carries the resulting path/width/height.
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });

  const auth = await authorizeRequest(PERMISSIONS.CATEGORY_MANAGE, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE);
  if (!auth.ok) return NextResponse.json({ error: "This request is not allowed." }, { status: auth.status });

  const formData = await request.formData().catch(() => null);
  const fileField = formData?.get("file");
  const file = fileField instanceof File ? fileField : null;
  if (!file) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 400 });
  }

  const subdirField = formData?.get("subdir");
  const subdir = typeof subdirField === "string" && ALLOWED_SUBDIRS.has(subdirField) ? subdirField : "categories";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { path, width, height } = await processMediaImage(buffer, subdir);
    return NextResponse.json({ path, width, height }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That file isn't a readable image." }, { status: 400 });
  }
}
