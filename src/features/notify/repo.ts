import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
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

/** Subscribing again from the same browser (the same endpoint) updates the row instead of duplicating it. */
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
