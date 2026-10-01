import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { diffRolePermissions, type PermissionKey } from "@/features/auth/permissions";
import { db, type DbClient } from "@/server/db/client";
import { permissions, rolePermissions, roles, sessions, users } from "@/server/db/schema/access-control";

export type UserWithRole = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  roleId: number;
  roleKey: string;
};

export async function findUserByEmail(email: string): Promise<UserWithRole | null> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      roleId: users.roleId,
      roleKey: roles.key,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

export async function getPermissionKeysForRole(roleId: number): Promise<PermissionKey[]> {
  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((row) => row.key as PermissionKey);
}

export async function touchLastLogin(userId: number): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export type UserCredentials = { id: number; passwordHash: string };

export async function findUserById(userId: number): Promise<UserCredentials | null> {
  const [row] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

export async function updatePasswordHash(tx: DbClient, userId: number, passwordHash: string): Promise<void> {
  await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/** Keeps `keepSessionId` (the caller's own, hashed session id) and deletes every other session of `userId`. */
export async function deleteOtherSessions(tx: DbClient, userId: number, keepSessionId: string | null): Promise<void> {
  await tx.delete(sessions).where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId));
}

/**
 * Grants and revokes `role_permissions` rows so `roleId` ends up holding exactly `desiredKeys`
 * (ARCHITECTURE.md §4.5, DATABASE.md DB18): the seed sync for `developer` and `admin`.
 */
export async function syncRolePermissions(roleId: number, desiredKeys: PermissionKey[]): Promise<{ granted: number; revoked: number }> {
  const currentKeys = await getPermissionKeysForRole(roleId);
  const { toGrant, toRevoke } = diffRolePermissions(desiredKeys, currentKeys);

  if (toGrant.length > 0) {
    const rows = await db.select({ id: permissions.id }).from(permissions).where(inArray(permissions.key, toGrant));
    for (const row of rows) {
      await db
        .insert(rolePermissions)
        .values({ roleId, permissionId: row.id })
        // No-op update: makes the insert idempotent without an "insert ignore".
        .onDuplicateKeyUpdate({ set: { roleId: sql`role_id` } });
    }
  }

  if (toRevoke.length > 0) {
    const rows = await db.select({ id: permissions.id }).from(permissions).where(inArray(permissions.key, toRevoke));
    const revokeIds = rows.map((row) => row.id);
    if (revokeIds.length > 0) {
      await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, roleId), inArray(rolePermissions.permissionId, revokeIds)));
    }
  }

  return { granted: toGrant.length, revoked: toRevoke.length };
}
