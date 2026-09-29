import { requireSession } from "@/server/auth/permissions";
import { PanelSidebar } from "@/components/panel/PanelSidebar";
import { LogoutButton } from "@/components/panel/LogoutButton";
import { siteConfig } from "@/config/site.config";

export default async function ProtectedPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="bg-background flex min-h-screen flex-1">
      <PanelSidebar permissions={session.permissions} logoText={siteConfig.logoText} />
      <div className="flex flex-1 flex-col">
        <header className="border-border flex items-center justify-between border-b px-6 py-3">
          <span className="text-muted-foreground text-sm">
            {session.name} &middot; {session.roleKey}
          </span>
          <LogoutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
