import { z } from "zod";
import { findUserByEmail, touchLastLogin } from "@/features/auth/repo";
import { consumeRateLimit, resetRateLimit } from "@/server/rate-limit";
import { verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";

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
