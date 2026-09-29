import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/server/env";

// ARCHITECTURE.md §5: only generated WebP variants may be served, and only from inside
// UPLOAD_DIR/media. Anything else -- wrong extension, wrong size, `../` segments -- is a 404,
// not an error, so this never leaks whether a path merely doesn't exist.
const MEDIA_PATH_PATTERN = /^[a-z0-9/-]+-(400|800|1200)\.webp$/;
const MEDIA_ROOT = path.join(env.UPLOAD_DIR, "media");

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const relativePath = segments.join("/");

  if (!MEDIA_PATH_PATTERN.test(relativePath)) {
    return notFound();
  }

  const filePath = path.join(MEDIA_ROOT, relativePath);
  // Defense in depth: the regex already forbids ".", but confirm containment on the resolved path too.
  if (filePath !== MEDIA_ROOT && !filePath.startsWith(MEDIA_ROOT + path.sep)) {
    return notFound();
  }

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return notFound();
  }

  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
