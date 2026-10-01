import { z } from "zod";
import { deleteOtherSessions, findUserByEmail, findUserById, touchLastLogin, updatePasswordHash } from "@/features/auth/repo";
import { insertAuditLog } from "@/features/audit/repo";
import { consumeRateLimit, resetRateLimit } from "@/server/rate-limit";
import { db } from "@/server/db/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession, getCurrentSessionId } from "@/server/auth/session";

export const LoginInputSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

const LOGIN_RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };
const LOGIN_IP_RATE_LIMIT = { max: 20, windowMs: 15 * 60 * 1000 };

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(input: LoginInput, ctx: { ip: string; userAgent: string }): Promise<LoginResult> {
  const [byEmail, byIp] = await Promise.all([
    consumeRateLimit(`login:email:${input.email}`, LOGIN_RATE_LIMIT),
    consumeRateLimit(`login:ip:${ctx.ip}`, LOGIN_IP_RATE_LIMIT),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const user = await findUserByEmail(input.email);
  if (!user || !user.isActive) {
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  await resetRateLimit(`login:email:${input.email}`);
  await touchLastLogin(user.id);
  await createSession(user.id, ctx.ip, ctx.userAgent);

  return { ok: true };
}

export async function logout(): Promise<void> {
  await destroySession();
}

export const ChangePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "Your new password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Choose a new password different from your current one.",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

const PASSWORD_CHANGE_RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };
const GENERIC_PASSWORD_ERROR = "Your current password is incorrect.";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Any signed-in user, no permission key (BUILD_PLAN.md C25): verifies the current password,
 * then in one transaction sets the new hash, deletes every other session of this user (the
 * caller's own session stays) and writes an audit row with no secrets in it.
 */
export async function changePassword(userId: number, input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const rate = await consumeRateLimit(`password-change:${userId}`, PASSWORD_CHANGE_RATE_LIMIT);
  if (!rate.allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const user = await findUserById(userId);
  if (!user) {
    return { ok: false, error: GENERIC_PASSWORD_ERROR, fieldErrors: { currentPassword: GENERIC_PASSWORD_ERROR } };
  }

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    return { ok: false, error: GENERIC_PASSWORD_ERROR, fieldErrors: { currentPassword: GENERIC_PASSWORD_ERROR } };
  }

  const currentSessionId = await getCurrentSessionId();
  const newPasswordHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await updatePasswordHash(tx, userId, newPasswordHash);
    await deleteOtherSessions(tx, userId, currentSessionId);
    await insertAuditLog(tx, {
      userId,
      action: "user.password_change",
      entity: "user",
      entityId: userId,
      oldValues: null,
      newValues: { changedAt: new Date().toISOString() },
      createdAt: new Date(),
    });
  });

  await resetRateLimit(`password-change:${userId}`);
  return { ok: true };
}
