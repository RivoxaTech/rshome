import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { firstAllowedPath } from "@/features/auth/landing";
import { getStoreIdentity } from "@/features/settings/service";
import { LoginForm } from "@/app/panel/login/LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(firstAllowedPath(session.permissions));
  const identity = await getStoreIdentity();

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-6">
      <div className="bg-card border-border shadow-soft flex w-full max-w-sm flex-col gap-6 rounded-lg border p-8">
        <div>
          <p className="font-serif text-lg tracking-[0.3em] uppercase">{identity.logoText}</p>
          <h1 className="text-muted-foreground mt-2 text-sm">Panel sign in</h1>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
