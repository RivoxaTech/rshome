import { eq } from "drizzle-orm";
import type { PermissionKey } from "@/features/auth/permissions";
import { db } from "@/server/db/client";
import { permissions, rolePermissions, roles, users } from "@/server/db/schema/access-control";

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
