import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { LoginForm } from "@/app/panel/login/LoginForm";
import { siteConfig } from "@/config/site.config";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/panel");

  return (
    <div className="bg-background flex flex-1 items-center justify-center p-6">
      <div className="bg-card border-border shadow-soft flex w-full max-w-sm flex-col gap-6 rounded-lg border p-8">
        <div>
          <p className="font-serif text-lg tracking-[0.3em] uppercase">{siteConfig.logoText}</p>
          <h1 className="text-muted-foreground mt-2 text-sm">Panel sign in</h1>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
