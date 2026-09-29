import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@/features/auth/permissions";
import { getProofFile } from "@/features/payments/service";
import { authorizeRequest } from "@/server/auth/permissions";
import { proofFilePath } from "@/server/storage/proofs";

const idSchema = z.coerce.number().int().positive();

/**
 * A payment screenshot for staff (ARCHITECTURE.md §4.4, PAY-03): a panel session with
 * `order.verify_payment` or `order.view`, the file looked up by proof id (never a path from the
 * request), and never cached or sniffed as anything but WebP.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/files/proof/[id]">) {
  const auth = await authorizeRequest(PERMISSIONS.ORDER_VERIFY_PAYMENT, PERMISSIONS.ORDER_VIEW);
  if (!auth.ok) return new NextResponse(null, { status: auth.status });

  const id = idSchema.safeParse((await params).id);
  const relativePath = id.success ? await getProofFile(id.data) : null;
  const filePath = relativePath ? proofFilePath(relativePath) : null;
  if (!filePath) return new NextResponse(null, { status: 404 });

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
