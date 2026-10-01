import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/features/notify/schemas";
import { subscribe, unsubscribe } from "@/features/notify/service";
import { authorizeRequest } from "@/server/auth/permissions";
import { getUserAgent, isAllowedOrigin } from "@/server/request";

/**
 * The panel bell's "Enable notifications" (BUILD_PLAN.md S21, broadened S17): a signed-in user
 * holding `order.view` or `wholesale.view` may subscribe a device — the bell itself shows for
 * either (`PanelFrame.tsx`), so this must accept both; the Developer, who holds neither, is
 * refused.
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  const auth = await authorizeRequest(PERMISSIONS.ORDER_VIEW, PERMISSIONS.WHOLESALE_VIEW);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = pushSubscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

  await subscribe(auth.session.id, parsed.data, (await getUserAgent()).slice(0, 255));
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** "Turning it off removes it": the device's own subscription, scoped to this user. */
export async function DELETE(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  const auth = await authorizeRequest(PERMISSIONS.ORDER_VIEW, PERMISSIONS.WHOLESALE_VIEW);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = pushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  await unsubscribe(auth.session.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
