"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PanelIcon, type PanelIconName } from "./icons";
import { LogoutButton } from "./LogoutButton";
import type { PanelTheme } from "./theme";
import { ThemeToggle } from "./ThemeToggle";
import { Avatar, ICON_BUTTON } from "./ui";

export type PanelNavItem = { label: string; href: string; icon: PanelIconName; badge: number };

function Sidebar({ nav, userName, logoText, onNavigate }: { nav: PanelNavItem[]; userName: string; logoText: string; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <Link href="/panel" onClick={onNavigate} className="border-sidebar-border flex h-16 shrink-0 items-center gap-3 border-b px-5">
        <span aria-hidden="true" className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-md text-xs font-bold tracking-wide">
          {logoText.slice(0, 2).toUpperCase()}
        </span>
        <span className="text-[15px] font-semibold tracking-wide">{logoText}</span>
      </Link>

      <nav aria-label="Panel" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="grid gap-1">
          {nav.map((item) => {
            const active = item.href === "/panel" ? pathname === "/panel" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                    active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`}
                >
                  <PanelIcon name={item.icon} className={`h-5 w-5 shrink-0 ${active ? "text-accent" : ""}`} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="bg-accent text-accent-foreground min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums">
                      <span className="sr-only">, </span>
                      {item.badge}
                      <span className="sr-only"> need action</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3">
        <div className="border-sidebar-border flex items-center gap-3 rounded-lg border p-3">
          <Avatar name={userName} className="size-10 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{userName}</p>
            <p className="text-sidebar-muted text-xs">Signed in</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The panel frame (C21): a fixed full-height sidebar beside a header and the one scrolling content
 * area. On phones and tablets the sidebar is a drawer behind the header's menu button, closed by
 * a link, the backdrop or Esc.
 */
export function PanelFrame({
  nav,
  userName,
  logoText,
  theme,
  children,
}: {
  nav: PanelNavItem[];
  userName: string;
  logoText: string;
  theme: PanelTheme;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const waiting = nav.reduce((sum, item) => sum + item.badge, 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const sidebar = <Sidebar nav={nav} userName={userName} logoText={logoText} onNavigate={() => setOpen(false)} />;

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="bg-sidebar text-sidebar-foreground hidden w-72 shrink-0 lg:block">{sidebar}</aside>

      <div inert={!open} className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-black/50 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} />
        <aside
          id="panel-drawer"
          aria-label="Menu"
          className={`bg-sidebar text-sidebar-foreground absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebar}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card border-border flex h-16 shrink-0 items-center gap-2 border-b px-3 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="panel-drawer"
            className={`${ICON_BUTTON} relative lg:hidden`}
          >
            <PanelIcon name="menu" />
            {waiting > 0 && <span aria-hidden="true" className="bg-accent ring-card absolute top-2 right-2 size-2 rounded-full ring-2" />}
          </button>
          <span className="text-[15px] font-semibold tracking-wide lg:hidden">{logoText}</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle initial={theme} />
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
