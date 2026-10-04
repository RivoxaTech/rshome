import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { PermissionKey } from "@/features/auth/permissions";
import { db } from "@/server/db/client";
import { permissions, rolePermissions, users } from "@/server/db/schema/access-control";
import { pushSubscriptions } from "@/server/db/schema/notify";

export type StoredSubscription = { id: number; endpoint: string; p256dh: string; auth: string };

/** `endpoint` can run to 500 characters; the hash carries the unique index instead (notify.ts). */
function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

const SELECT_SUBSCRIPTION = {
  id: pushSubscriptions.id,
  endpoint: pushSubscriptions.endpoint,
  p256dh: pushSubscriptions.p256dh,
  auth: pushSubscriptions.auth,
};

/** A staff member has a handful of devices; anything beyond this is a stuck re-subscribe loop or a crafted request (S22 SEC-04). */
const MAX_SUBSCRIPTIONS_PER_USER = 10;

/** Subscribing again from the same browser (the same endpoint) updates the row instead of duplicating it; the oldest rows go once a user has more than `MAX_SUBSCRIPTIONS_PER_USER`. */
export async function upsertSubscription(input: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}): Promise<void> {
  const endpointHash = hashEndpoint(input.endpoint);
  const now = new Date();
  await db
    .insert(pushSubscriptions)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      endpointHash,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      createdAt: now,
    })
    .onDuplicateKeyUpdate({
      set: { userId: input.userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, lastUsedAt: now },
    });

  // Newest first; a user has a handful of rows, so the surplus is sliced here (MySQL has no bare OFFSET).
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, input.userId))
    .orderBy(desc(pushSubscriptions.createdAt), desc(pushSubscriptions.id));
  const surplus = rows.slice(MAX_SUBSCRIPTIONS_PER_USER).map((row) => row.id);
  if (surplus.length > 0) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, surplus));
}

/** Scoped to `userId` so one signed-in user can never remove another's subscription. */
export async function deleteSubscription(userId: number, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpointHash, hashEndpoint(endpoint))));
}

export async function deleteSubscriptionById(id: number): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}

export async function touchSubscription(id: number): Promise<void> {
  await db.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(eq(pushSubscriptions.id, id));
}

/** Every subscription of every active user holding `permission` (new order / screenshot / wholesale events). */
export async function listSubscriptionsForPermission(permission: PermissionKey): Promise<StoredSubscription[]> {
  return db
    .select(SELECT_SUBSCRIPTION)
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, users.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(permissions.key, permission), eq(users.isActive, true)));
}

export async function listSubscriptionsForUser(userId: number): Promise<StoredSubscription[]> {
  return db.select(SELECT_SUBSCRIPTION).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}
