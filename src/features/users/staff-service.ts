/**
 * The panel's users CRUD (S20, REQUIREMENTS DV-08, `user.manage`, Developer-only). Every write
 * locks the user row (`SELECT … FOR UPDATE`, one transaction), re-checks its rules there, and
 * records an `audit_logs` row with old/new values — name, email, role, active; **never** a
 * password or its hash (CLAUDE.md #8/#10). Refusals come back as `{ ok: false }`, never a throw.
 *
 * Rules (all under the lock):
 * - A user can't deactivate, delete or change the role of their own account.
 * - The last active user whose role grants `user.manage` can't be deactivated, deleted or moved
 *   to a role without it (so nobody can lock everyone out — this generalises "the last active
 *   Developer" to custom roles too).
 * - Email is unique, case-insensitively (normalised to lowercase; the unique index is the backstop).
 * - A stale edit (the row changed since the page was opened) is refused through `version`.
 * - Deactivating a user, changing their role, or resetting their password deletes every session
 *   of theirs at once (permissions are re-read from `role_id` on every request anyway, so a role
 *   change would apply on their next click regardless — the revoke forces a clean re-login).
 * - Delete only when nothing references the user (never logged in, no sessions, audit rows,
 *   order history, screenshot reviews, notes or push subscriptions); otherwise "Deactivate instead".
 */
import type { ZodError } from "zod";
import { insertAuditLog } from "@/features/audit/repo";
import { PERMISSIONS } from "@/features/auth/permissions";
import type { StaffActionResult } from "@/features/catalog/staff-service";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { fingerprint } from "@/lib/fingerprint";
import { formatKarachiDateTime } from "@/lib/karachi-datetime";
import { hashPassword } from "@/server/auth/password";
import { db, type DbClient } from "@/server/db/client";
import { consumeRateLimit } from "@/server/rate-limit";
import { createUserInputSchema, resetPasswordInputSchema, updateUserInputSchema, type CreateUserInput, type UpdateUserInput } from "./schemas";
import {
  countActiveUsersInRoles,
  countUserReferences,
  countUsers,
  deleteAllSessions,
  deleteUser,
  emailInUse,
  getUserStaffRow,
  insertUser,
  listRoleOptions,
  listUsersPage,
  lockUserById,
  roleIdsHolding,
  updateUser,
  type UserReferenceCounts,
  type UserStaffRow,
} from "./staff-repo";

export type { StaffActionResult };

type Actor = { id: number };

/** A refusal staff see; anything else thrown is a real failure and rolls the transaction back. */
class UserActionError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

const DUPLICATE_ENTRY = 1062;
const EMAIL_IN_USE = "Another user already has this email address.";
export const STALE_USER_MESSAGE = "Someone else changed this user after you opened the page. Reload to see their changes, then make yours again.";
const SELF_DEACTIVATE = "You can't deactivate your own account.";
const SELF_ROLE_CHANGE = "You can't change your own role.";
const SELF_DELETE = "You can't delete your own account.";
const LAST_MANAGER_DEACTIVATE = "This is the last active user who can manage users, so it can't be deactivated.";
const LAST_MANAGER_ROLE_CHANGE = "This is the last active user who can manage users, so it must keep a role with that permission.";
const LAST_MANAGER_DELETE = "This is the last active user who can manage users, so it can't be deleted.";
const PASSWORD_RESET_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };

function invalid(error: ZodError): StaffActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrorsOf(error) };
}

function refused(error: UserActionError): StaffActionResult {
  return error.field ? { ok: false, error: error.message, fieldErrors: { [error.field]: error.message } } : { ok: false, error: error.message };
}

/** Drizzle wraps driver errors (`DrizzleQueryError.cause`); the mysql2 error carries `errno`. */
function isDuplicateEntry(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = "cause" in error && typeof error.cause === "object" && error.cause !== null ? error.cause : error;
  return (candidate as { errno?: number }).errno === DUPLICATE_ENTRY;
}

// ── Audit values and the version token ──────────────────────────────────────────────────────────

type UserAuditFields = Pick<UserStaffRow, "name" | "email" | "roleId" | "roleKey" | "isActive">;

/** What an audit row records about a user: identity, role and status. No hash, ever. */
export function auditValues(user: UserAuditFields) {
  return { name: user.name, email: user.email, roleId: user.roleId, roleKey: user.roleKey, isActive: user.isActive };
}

/**
 * The optimistic-concurrency token, posted back as `version`: the row's `updated_at` plus a
 * fingerprint of what the form edits, since `updated_at` is whole-second (`lib/fingerprint.ts`).
 */
export function userVersion(user: UserAuditFields & Pick<UserStaffRow, "updatedAt">): string {
  return `${user.updatedAt.getTime()}@${fingerprint(auditValues(user))}`;
}

// ── The list ────────────────────────────────────────────────────────────────────────────────────

export type StaffUserListItem = {
  serial: number;
  id: number;
  name: string;
  email: string;
  roleName: string;
  isActive: boolean;
  /** Karachi-formatted, or null when they've never signed in. */
  lastLoginAt: string | null;
  createdAt: string;
};

export async function listStaffUsers(query: { q?: string; page: number; pageSize: number }): Promise<{ items: StaffUserListItem[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const total = await countUsers(query.q);
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const rows = await listUsersPage(query.q, page, query.pageSize);
  const offset = (page - 1) * query.pageSize;
  const items = rows.map((row, index) => ({
    serial: offset + index + 1,
    id: row.id,
    name: row.name,
    email: row.email,
    roleName: row.roleName,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt ? formatKarachiDateTime(row.lastLoginAt) : null,
    createdAt: formatKarachiDateTime(row.createdAt),
  }));
  return { items, total, page, pageSize: query.pageSize, pageCount };
}

// ── The forms ───────────────────────────────────────────────────────────────────────────────────

export type RoleOption = { id: number; key: string; name: string; isSystem: boolean };

export function getRoleOptions(): Promise<RoleOption[]> {
  return listRoleOptions();
}

export type UserEditFormData = { user: UserStaffRow; version: string; lastLoginAt: string | null; createdAt: string; deleteGuard: UserDeleteGuard };

export async function getUserForEdit(id: number): Promise<UserEditFormData | null> {
  const user = await getUserStaffRow(id);
  if (!user) return null;
  const references = await countUserReferences(id);
  return {
    user,
    version: userVersion(user),
    lastLoginAt: user.lastLoginAt ? formatKarachiDateTime(user.lastLoginAt) : null,
    createdAt: formatKarachiDateTime(user.createdAt),
    deleteGuard: deleteGuardFor(user, references),
  };
}

// ── Shared rule checks (inside the transaction, after the lock) ─────────────────────────────────

/** True when `user` is the only active user whose role grants `user.manage` — others' roles are read fresh under the caller's transaction. */
async function isLastActiveManager(tx: DbClient, user: UserStaffRow): Promise<boolean> {
  const managerRoleIds = await roleIdsHolding(PERMISSIONS.USER_MANAGE, tx);
  if (!user.isActive || !managerRoleIds.includes(user.roleId)) return false;
  return (await countActiveUsersInRoles(managerRoleIds, user.id, tx)) === 0;
}

async function assertEmailAvailable(tx: DbClient, email: string, excludeId?: number): Promise<void> {
  if (await emailInUse(email, excludeId, tx)) throw new UserActionError(EMAIL_IN_USE, "email");
}

// ── Create ──────────────────────────────────────────────────────────────────────────────────────

export async function createUser(rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = createUserInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input: CreateUserInput = parsed.data;

  // Hashed before the transaction: scrypt takes real CPU time and nothing needs the lock for it.
  const passwordHash = await hashPassword(input.password);

  try {
    const id = await db.transaction(async (tx) => {
      await assertEmailAvailable(tx, input.email);
      const role = (await listRoleOptions(tx)).find((option) => option.id === input.roleId);
      if (!role) throw new UserActionError("Choose a role.", "roleId");

      const now = new Date();
      const id = await insertUser(tx, { name: input.name, email: input.email, passwordHash, roleId: input.roleId, isActive: input.isActive, createdAt: now, updatedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "user.create",
        entity: "user",
        entityId: id,
        oldValues: null,
        newValues: auditValues({ name: input.name, email: input.email, roleId: input.roleId, roleKey: role.key, isActive: input.isActive }),
        createdAt: now,
      });
      return id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof UserActionError) return refused(error);
    // The unique index is the backstop for two creates racing past `assertEmailAvailable`.
    if (isDuplicateEntry(error)) return { ok: false, error: EMAIL_IN_USE, fieldErrors: { email: EMAIL_IN_USE } };
    throw error;
  }
}

// ── Update ──────────────────────────────────────────────────────────────────────────────────────

export async function updateUserById(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = updateUserInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);
  const input: UpdateUserInput = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const current = await lockUserById(tx, id);
      if (!current) throw new UserActionError("User not found.");
      if (userVersion(current) !== input.version) throw new UserActionError(STALE_USER_MESSAGE);
      await assertEmailAvailable(tx, input.email, id);

      const role = (await listRoleOptions(tx)).find((option) => option.id === input.roleId);
      if (!role) throw new UserActionError("Choose a role.", "roleId");

      const roleChanged = input.roleId !== current.roleId;
      const deactivating = current.isActive && !input.isActive;
      const isSelf = id === actor.id;
      if (isSelf && deactivating) throw new UserActionError(SELF_DEACTIVATE, "isActive");
      if (isSelf && roleChanged) throw new UserActionError(SELF_ROLE_CHANGE, "roleId");

      if ((deactivating || roleChanged) && (await isLastActiveManager(tx, current))) {
        if (deactivating) throw new UserActionError(LAST_MANAGER_DEACTIVATE, "isActive");
        const managerRoleIds = await roleIdsHolding(PERMISSIONS.USER_MANAGE, tx);
        if (!managerRoleIds.includes(input.roleId)) throw new UserActionError(LAST_MANAGER_ROLE_CHANGE, "roleId");
      }

      const now = new Date();
      const next = { name: input.name, email: input.email, roleId: input.roleId, roleKey: role.key, isActive: input.isActive };
      await updateUser(tx, id, { name: next.name, email: next.email, roleId: next.roleId, isActive: next.isActive, updatedAt: now });
      await insertAuditLog(tx, { userId: actor.id, action: "user.update", entity: "user", entityId: id, oldValues: auditValues(current), newValues: auditValues(next), createdAt: now });

      if (deactivating || input.isActive !== current.isActive) {
        await insertAuditLog(tx, {
          userId: actor.id,
          action: input.isActive ? "user.activate" : "user.deactivate",
          entity: "user",
          entityId: id,
          oldValues: { isActive: current.isActive },
          newValues: { isActive: input.isActive },
          createdAt: now,
        });
      }
      if (roleChanged) {
        await insertAuditLog(tx, {
          userId: actor.id,
          action: "user.role_change",
          entity: "user",
          entityId: id,
          oldValues: { roleId: current.roleId, roleKey: current.roleKey },
          newValues: { roleId: role.id, roleKey: role.key },
          createdAt: now,
        });
      }
      // New permissions apply at once, and a deactivated user is out immediately.
      if (deactivating || roleChanged) await deleteAllSessions(tx, id);
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof UserActionError) return refused(error);
    if (isDuplicateEntry(error)) return { ok: false, error: EMAIL_IN_USE, fieldErrors: { email: EMAIL_IN_USE } };
    throw error;
  }
}

// ── Activate / deactivate (the one-click quick action) ──────────────────────────────────────────

export async function setUserActive(id: number, isActive: boolean, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const current = await lockUserById(tx, id);
      if (!current) throw new UserActionError("User not found.");
      if (current.isActive === isActive) throw new UserActionError(`This user is already ${isActive ? "active" : "inactive"}.`);
      if (!isActive && id === actor.id) throw new UserActionError(SELF_DEACTIVATE);
      if (!isActive && (await isLastActiveManager(tx, current))) throw new UserActionError(LAST_MANAGER_DEACTIVATE);

      const now = new Date();
      await updateUser(tx, id, { isActive, updatedAt: now });
      await insertAuditLog(tx, {
        userId: actor.id,
        action: isActive ? "user.activate" : "user.deactivate",
        entity: "user",
        entityId: id,
        oldValues: { isActive: current.isActive },
        newValues: { isActive },
        createdAt: now,
      });
      if (!isActive) await deleteAllSessions(tx, id);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof UserActionError) return refused(error);
    throw error;
  }
}

// ── Reset password ──────────────────────────────────────────────────────────────────────────────

/**
 * Sets a new password for another user (the Developer typed or generated it; the page shows it
 * once and the server never echoes it). Rate-limited per actor like login, revokes every session
 * of that user, and audits only that a reset happened — never the password or hash.
 */
export async function resetUserPassword(id: number, rawInput: unknown, actor: Actor): Promise<StaffActionResult> {
  const parsed = resetPasswordInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalid(parsed.error);

  const rate = await consumeRateLimit(`user-password-reset:${actor.id}`, PASSWORD_RESET_RATE_LIMIT);
  if (!rate.allowed) return { ok: false, error: "Too many password resets. Please try again later." };

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await db.transaction(async (tx) => {
      const current = await lockUserById(tx, id);
      if (!current) throw new UserActionError("User not found.");
      const now = new Date();
      await updateUser(tx, id, { passwordHash, updatedAt: now });
      await deleteAllSessions(tx, id);
      await insertAuditLog(tx, {
        userId: actor.id,
        action: "user.password_reset",
        entity: "user",
        entityId: id,
        oldValues: null,
        newValues: { email: current.email, resetAt: now.toISOString(), sessionsRevoked: true },
        createdAt: now,
      });
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof UserActionError) return refused(error);
    throw error;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────────────────────────

export type UserDeleteGuard = { allowed: true } | { allowed: false; reason: string };

function deleteGuardFor(user: UserStaffRow, references: UserReferenceCounts): UserDeleteGuard {
  const hasHistory = user.lastLoginAt !== null || Object.values(references).some((value) => value > 0);
  if (!hasHistory) return { allowed: true };
  const parts: string[] = [];
  if (user.lastLoginAt !== null || references.sessions > 0) parts.push("has signed in");
  if (references.auditRows > 0) parts.push(`has ${references.auditRows} audit ${references.auditRows === 1 ? "entry" : "entries"}`);
  if (references.orderHistory > 0 || references.proofReviews > 0) parts.push("has worked on orders");
  if (references.wholesaleNotes > 0) parts.push("has written wholesale notes");
  if (references.pushSubscriptions > 0) parts.push("has notification devices");
  return { allowed: false, reason: `This user ${parts.join(", ")}, so their record must stay. Deactivate them instead to remove their access.` };
}

export async function deleteUserById(id: number, actor: Actor): Promise<StaffActionResult> {
  try {
    await db.transaction(async (tx) => {
      const current = await lockUserById(tx, id);
      if (!current) throw new UserActionError("User not found.");
      if (id === actor.id) throw new UserActionError(SELF_DELETE);
      if (await isLastActiveManager(tx, current)) throw new UserActionError(LAST_MANAGER_DELETE);
      const guard = deleteGuardFor(current, await countUserReferences(id, tx));
      if (!guard.allowed) throw new UserActionError(guard.reason);

      const now = new Date();
      await deleteUser(tx, id);
      await insertAuditLog(tx, { userId: actor.id, action: "user.delete", entity: "user", entityId: id, oldValues: auditValues(current), newValues: {}, createdAt: now });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof UserActionError) return refused(error);
    throw error;
  }
}
