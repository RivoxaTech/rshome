import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { authorizeRequest } from "@/server/auth/permissions";
import { isAllowedOrigin } from "@/server/request";
import { MediaImageError, processMediaImage, type MediaImageRefusal } from "@/server/storage/images";

// A generous cap for a hand-picked category/product photo, well under what sharp can decode
// safely (CLAUDE.md #11: no heavy work at request time, sharp already runs at concurrency 1).
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
// The multipart framing around the file; the declared body size is refused above this, unread.
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

const ALLOWED_SUBDIRS = new Set(["categories", "products"]);

const TOO_LARGE = { error: "Images must be under 8 MB." };
const REFUSALS: Record<MediaImageRefusal, string> = {
  unsupported_type: "Please choose a JPG, PNG or WebP image.",
  too_many_pixels: "This image is too large (over 40 megapixels). Please resize it before uploading.",
  unreadable: "That file isn't a readable image.",
};

/**
 * The panel's image upload (ARCHITECTURE.md §1): category images and product photos, by
 * `subdir`. A Route Handler, not a Server Action, since Server Actions cap their body at 1MB
 * (Next's own docs) and a photo easily exceeds that; the create/edit form only ever carries the
 * resulting path/width/height. Checks, in order: Origin, permission, declared size, file size,
 * then the file's real type and pixel count before anything is decoded (S22 SEC-03).
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });

  const auth = await authorizeRequest(PERMISSIONS.CATEGORY_MANAGE, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE);
  if (!auth.ok) return NextResponse.json({ error: "This request is not allowed." }, { status: auth.status });

  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return NextResponse.json({ error: "Choose an image file." }, { status: 411 });
  if (declared > MAX_BODY_BYTES) return NextResponse.json(TOO_LARGE, { status: 413 });

  const formData = await request.formData().catch(() => null);
  const fileField = formData?.get("file");
  const file = fileField instanceof File ? fileField : null;
  if (!file) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json(TOO_LARGE, { status: 400 });

  const subdirField = formData?.get("subdir");
  const subdir = typeof subdirField === "string" && ALLOWED_SUBDIRS.has(subdirField) ? subdirField : "categories";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { path, width, height } = await processMediaImage(buffer, subdir);
    return NextResponse.json({ path, width, height }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaImageError) return NextResponse.json({ error: REFUSALS[error.reason] }, { status: error.reason === "unsupported_type" ? 415 : 422 });
    return NextResponse.json({ error: REFUSALS.unreadable }, { status: 400 });
  }
}
