import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { LoginForm } from "@/app/panel/login/LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/panel");

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-xl font-semibold">Panel sign in</h1>
        <LoginForm />
      </div>
    </div>
  );
}
