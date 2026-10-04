"use client";

import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { usePanelUi } from "@/components/panel/PanelUiContext";
import { LogoutButton } from "@/components/panel/LogoutButton";
import { NotificationBell } from "@/components/panel/notifications/NotificationBell";

export function PanelHeader({ showNotifications, vapidPublicKey }: { showNotifications: boolean; vapidPublicKey: string | null }) {
  const { title, theme, toggleTheme, mobileOpen, setMobileOpen } = usePanelUi();

  return (
    <header className="border-border bg-background flex h-[52px] shrink-0 items-center justify-between border-b px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls="panel-mobile-nav"
          title="Open menu"
          className="text-muted-foreground hover:bg-secondary -ml-1.5 rounded-md p-1.5 md:hidden"
        >
          <Icon d={ICON_PATHS.menu} className="h-5 w-5" />
        </button>
        <h1 className="truncate text-[15px] font-semibold sm:text-lg">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {showNotifications && <NotificationBell vapidPublicKey={vapidPublicKey} />}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground rounded-md p-2 transition-colors"
        >
          <Icon d={theme === "dark" ? ICON_PATHS.sun : ICON_PATHS.moon} className="h-[18px] w-[18px]" />
        </button>
        <LogoutButton />
      </div>
    </header>
  );
}
