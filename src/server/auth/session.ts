import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import type { PermissionKey } from "@/features/auth/permissions";
import { getPermissionKeysForRole } from "@/features/auth/repo";
import { db } from "@/server/db/client";
import { sessions, users, roles } from "@/server/db/schema/access-control";

export const SESSION_COOKIE = "panel_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
/** last_seen_at is updated at most this often, so a busy admin isn't writing to `sessions` on every click. */
const LAST_SEEN_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  roleId: number;
  roleKey: string;
  permissions: ReadonlySet<PermissionKey>;
};

/** Pure: the cookie holds the raw token, the DB stores only its hash. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function loadSessionRow(hashedId: string) {
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      roleId: users.roleId,
      roleKey: roles.key,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(sessions.id, hashedId))
    .limit(1);
  return row ?? null;
}

/** Reads the session once per request (React `cache()`), verifying it against the DB every time. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const hashedId = hashToken(token);
  const row = await loadSessionRow(hashedId);
  if (!row) return null;

  const now = new Date();
  if (row.expiresAt <= now || !row.isActive) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_UPDATE_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, hashedId));
  }

  const permissionKeys = await getPermissionKeysForRole(row.roleId);

  return {
    id: row.userId,
    name: row.name,
    email: row.email,
    roleId: row.roleId,
    roleKey: row.roleKey,
    permissions: new Set(permissionKeys),
  };
});

/** The current request's hashed session id (`sessions.id`), or null when there is no cookie. */
export async function getCurrentSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** Creates a DB session row and sets the cookie. Must run in a Server Action or Route Handler. */
export async function createSession(userId: number, ip: string, userAgent: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Expired rows only ever accumulate otherwise (S22 BUG-17); a login is rare enough to pay for the sweep.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip,
    userAgent: userAgent.slice(0, 255),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Deletes the DB session row and clears the cookie. Must run in a Server Action or Route Handler. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}
