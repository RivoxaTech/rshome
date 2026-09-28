"use server";

import { redirect } from "next/navigation";
import { LoginInputSchema, login } from "@/features/auth/service";
import { getClientIp, getUserAgent } from "@/server/request";

export type LoginActionState = { error: string } | undefined;

export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const parsed = LoginInputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const [ip, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
  const result = await login(parsed.data, { ip, userAgent });
  if (!result.ok) {
    return { error: result.error };
  }

  redirect("/panel");
}
