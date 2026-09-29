import { redirect } from "next/navigation";
import type { PermissionKey } from "@/features/auth/permissions";
import { getSession, type SessionUser } from "@/server/auth/session";

/** Pure: no I/O, so it's unit-tested directly. */
export function hasPermission(granted: ReadonlySet<PermissionKey>, key: PermissionKey): boolean {
  return granted.has(key);
}

/**
 * Sits at the top of every panel page, action and route. Redirects to login when there is no
 * session, or to the 403 page when the session lacks `key`. Never checks role names.
 */
export async function requirePermission(key: PermissionKey): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/panel/login");
  if (!hasPermission(session.permissions, key)) redirect("/panel/403");
  return session;
}

/**
 * `requirePermission` for Route Handlers, which answer with a status instead of redirecting:
 * 401 without a session, 403 when the session holds none of `keys`.
 */
export async function authorizeRequest(
  ...keys: PermissionKey[]
): Promise<{ ok: true; session: SessionUser } | { ok: false; status: 401 | 403 }> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401 };
  if (!keys.some((key) => hasPermission(session.permissions, key))) return { ok: false, status: 403 };
  return { ok: true, session };
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/panel/login");
  return session;
}
