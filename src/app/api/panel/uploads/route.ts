import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { authorizeRequest } from "@/server/auth/permissions";
import { isAllowedOrigin, readFormFile } from "@/server/request";
import { processMediaImage } from "@/server/storage/images";

// A generous cap for a hand-picked category/product photo, well under what sharp can decode
// safely (CLAUDE.md #11: no heavy work at request time, sharp already runs at concurrency 1).
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * The panel's image upload (ARCHITECTURE.md's planned `api/panel/uploads/route.ts`, S10 phase 1:
 * category images; later phases reuse it for product photos). A Route Handler, not a Server
 * Action, since Server Actions cap their body at 1MB by default (Next's own docs) and a photo
 * easily exceeds that; the create/edit form only ever carries the resulting path string.
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });

  const auth = await authorizeRequest(PERMISSIONS.CATEGORY_MANAGE);
  if (!auth.ok) return NextResponse.json({ error: "This request is not allowed." }, { status: auth.status });

  const file = await readFormFile(request, "file");
  if (!file) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { path } = await processMediaImage(buffer, "categories");
    return NextResponse.json({ path }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That file isn't a readable image." }, { status: 400 });
  }
}
