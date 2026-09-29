import { NextResponse } from "next/server";
import { refuseUploadRequest, uploadCheckoutProof } from "@/features/payments/service";
import { getClientIp, readFormFile } from "@/server/request";

/**
 * Step one of a bank-transfer checkout (ARCHITECTURE.md §4.4): the payment screenshot, uploaded
 * before the order exists, answered with the token the order form sends along.
 */
export async function POST(request: Request) {
  const refusal = refuseUploadRequest(request);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  const result = await uploadCheckoutProof(() => readFormFile(request, "file"), { ip: await getClientIp() });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ token: result.token }, { status: 201 });
}
