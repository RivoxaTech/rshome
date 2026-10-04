import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { PermissionKey } from "@/features/auth/permissions";
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
 * Grants `keys` to `roleId`, idempotently, and never revokes anything (ARCHITECTURE.md §4.5, S20):
 * the seed's only tool for a system role's permissions — the full default set when the role is
 * first created, a brand-new key once after that. The live sets belong to the panel's roles page.
 * Returns the keys that were actually new to the role.
 */
export async function grantRolePermissions(roleId: number, keys: readonly PermissionKey[]): Promise<PermissionKey[]> {
  if (keys.length === 0) return [];
  const currentKeys = new Set(await getPermissionKeysForRole(roleId));
  const toGrant = keys.filter((key) => !currentKeys.has(key));
  if (toGrant.length === 0) return [];

  const rows = await db.select({ id: permissions.id, key: permissions.key }).from(permissions).where(inArray(permissions.key, toGrant));
  for (const row of rows) {
    await db
      .insert(rolePermissions)
      .values({ roleId, permissionId: row.id })
      // No-op update: makes the insert idempotent without an "insert ignore".
      .onDuplicateKeyUpdate({ set: { roleId: sql`role_id` } });
  }
  return rows.map((row) => row.key as PermissionKey);
}
