import { requireSession } from "@/server/auth/permissions";
import { PanelSidebar } from "@/components/panel/PanelSidebar";
import { LogoutButton } from "@/components/panel/LogoutButton";

export default async function ProtectedPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-1">
      <PanelSidebar permissions={session.permissions} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-black/10 px-6 py-3">
          <span className="text-sm text-black/60">
            {session.name} · {session.roleKey}
          </span>
          <LogoutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
