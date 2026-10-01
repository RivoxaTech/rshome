import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/features/auth/permissions";
import { sendTestNotification } from "@/features/notify/service";
import { authorizeRequest } from "@/server/auth/permissions";
import { isAllowedOrigin } from "@/server/request";

/**
 * The bell menu's "Send test notification" (BUILD_PLAN.md S21, broadened S17): only to this
 * user's own devices; `order.view` or `wholesale.view`, matching the bell's own visibility gate.
 */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  const auth = await authorizeRequest(PERMISSIONS.ORDER_VIEW, PERMISSIONS.WHOLESALE_VIEW);
  if (!auth.ok) return NextResponse.json({ error: "Not allowed." }, { status: auth.status });

  const result = await sendTestNotification(auth.session.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, sent: result.sent });
}
