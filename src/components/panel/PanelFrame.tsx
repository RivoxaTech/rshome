"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PanelIcon, type PanelIconName } from "./icons";
import { PANEL_SIDEBAR_COOKIE, savePanelCookie, type PanelTheme } from "./theme";
import { Avatar } from "./ui";

export type PanelNavItem = { label: string; href: string; icon: PanelIconName; badge: number };

type Frame = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  openDrawer: () => void;
  drawerOpen: boolean;
  /** Orders needing staff across the menu: the dot on the phone menu button. */
  waiting: number;
  theme: PanelTheme;
  setTheme: (theme: PanelTheme) => void;
};

const FrameContext = createContext<Frame | null>(null);

/** The frame's state for the page header's controls (PanelPage renders them). */
export function usePanelFrame(): Frame {
  const frame = useContext(FrameContext);
  if (!frame) throw new Error("usePanelFrame outside PanelFrame");
  return frame;
}

function Badge({ count, small }: { count: number; small: boolean }) {
  return (
    <span
      className={`bg-accent text-accent-foreground rounded-full text-center font-semibold tabular-nums ${
        small ? "ring-sidebar absolute -top-1.5 -right-2 h-4 min-w-4 px-1 text-[10px] leading-4 ring-2" : "h-5 min-w-5 px-1.5 text-[11px] leading-5"
      }`}
    >
      <span className="sr-only">, </span>
      {count}
      <span className="sr-only"> need action</span>
    </span>
  );
}

function Sidebar({ nav, userName, logoText, collapsed, onNavigate }: { nav: PanelNavItem[]; userName: string; logoText: string; collapsed: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/panel"
        onClick={onNavigate}
        aria-label={collapsed ? logoText : undefined}
        className={`border-sidebar-border flex h-13 shrink-0 items-center gap-2.5 border-b ${collapsed ? "justify-center" : "px-4"}`}
      >
        <span aria-hidden="true" className="bg-accent text-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tracking-wide">
          {logoText.slice(0, 2).toUpperCase()}
        </span>
        {!collapsed && <span className="truncate text-sm font-semibold tracking-wide">{logoText}</span>}
      </Link>

      <nav aria-label="Panel" className={`flex-1 px-2 py-3 ${collapsed ? "" : "overflow-y-auto"}`}>
        <ul className="grid gap-0.5">
          {nav.map((item) => {
            const active = item.href === "/panel" ? pathname === "/panel" : pathname.startsWith(item.href);
            return (
              <li key={item.href} className="group/nav relative">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={`flex h-9 items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors ${collapsed ? "justify-center" : "px-2.5"} ${
                    active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`}
                >
                  <span className="relative shrink-0">
                    <PanelIcon name={item.icon} className={`size-[18px] ${active ? "text-accent" : ""}`} />
                    {collapsed && item.badge > 0 && <Badge count={item.badge} small />}
                  </span>
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                  {!collapsed && item.badge > 0 && <Badge count={item.badge} small={false} />}
                </Link>
                {collapsed && (
                  <span
                    aria-hidden="true"
                    className="bg-foreground text-background pointer-events-none absolute top-1/2 left-full z-30 ml-2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover/nav:opacity-100 group-has-[:focus-visible]/nav:opacity-100"
                  >
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-2">
        <div className={`border-sidebar-border flex items-center gap-2.5 rounded-lg border p-2 ${collapsed ? "justify-center border-transparent" : ""}`} title={collapsed ? `${userName}, signed in` : undefined}>
          <Avatar name={userName} className="size-8 text-[11px]" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{userName}</p>
              <p className="text-sidebar-muted text-[11px]">Signed in</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The panel frame (C21, C22): a fixed full-height sidebar, 220 px or folded to a 64 px icon rail
 * (kept in a cookie), beside the page. Each page brings its own header and scrolling content
 * (PanelPage), so the content area is the only thing that scrolls. The frame is fixed to the
 * viewport and clips everything inside it, so nothing can make the document itself scroll. On
 * phones and tablets the sidebar is a drawer, closed by a link, the backdrop or Esc.
 */
export function PanelFrame({
  nav,
  userName,
  logoText,
  theme: initialTheme,
  collapsed: initialCollapsed,
  children,
}: {
  nav: PanelNavItem[];
  userName: string;
  logoText: string;
  theme: PanelTheme;
  collapsed: boolean;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const frame: Frame = {
    collapsed,
    toggleCollapsed: () => {
      savePanelCookie(PANEL_SIDEBAR_COOKIE, collapsed ? "expanded" : "collapsed");
      setCollapsed(!collapsed);
    },
    openDrawer: () => setDrawerOpen(true),
    drawerOpen,
    waiting: nav.reduce((sum, item) => sum + item.badge, 0),
    theme,
    setTheme,
  };

  return (
    <FrameContext value={frame}>
      <div data-panel-frame="" className="fixed inset-0 flex overflow-hidden">
        <aside className={`bg-sidebar text-sidebar-foreground hidden shrink-0 transition-[width] duration-200 lg:block ${collapsed ? "w-16" : "w-[220px]"}`}>
          <Sidebar nav={nav} userName={userName} logoText={logoText} collapsed={collapsed} onNavigate={() => {}} />
        </aside>

        <div inert={!drawerOpen} className={`fixed inset-0 z-40 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}>
          <div onClick={() => setDrawerOpen(false)} className={`absolute inset-0 bg-black/50 transition-opacity ${drawerOpen ? "opacity-100" : "opacity-0"}`} />
          <aside
            id="panel-drawer"
            aria-label="Menu"
            className={`bg-sidebar text-sidebar-foreground absolute inset-y-0 left-0 w-[260px] max-w-[85vw] shadow-2xl transition-transform duration-200 ${
              drawerOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <Sidebar nav={nav} userName={userName} logoText={logoText} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </FrameContext>
  );
}
