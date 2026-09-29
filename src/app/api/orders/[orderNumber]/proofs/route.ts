import { NextResponse } from "next/server";
import { hasOrderAccess } from "@/features/checkout/order-access-cookie";
import { orderNumberSchema } from "@/features/checkout/schemas";
import { refuseUploadRequest, uploadOrderProof } from "@/features/payments/service";
import { getClientIp, readFormFile } from "@/server/request";

/**
 * A payment screenshot from the order page (ARCHITECTURE.md §4.4): `?purpose=delivery` for the
 * delivery charge once staff have set it, `?purpose=goods` to replace a rejected one. Needs the
 * order-access cookie (D1).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/orders/[orderNumber]/proofs">) {
  const refusal = refuseUploadRequest(request);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  const parsed = orderNumberSchema.safeParse((await params).orderNumber);
  if (!parsed.success) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (!(await hasOrderAccess(parsed.data))) {
    return NextResponse.json({ error: "Please open your order from the tracking page first." }, { status: 403 });
  }

  const result = await uploadOrderProof(
    {
      orderNumber: parsed.data,
      purpose: new URL(request.url).searchParams.get("purpose"),
      readFile: () => readFormFile(request, "file"),
    },
    { ip: await getClientIp() },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true }, { status: 201 });
}
