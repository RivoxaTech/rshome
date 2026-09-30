"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { usePanelUi } from "@/components/panel/PanelUiContext";
import type { PanelNavItem } from "@/components/panel/nav-items";

function isActive(pathname: string, href: string): boolean {
  return href === "/panel" ? pathname === "/panel" : pathname.startsWith(href);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function PanelSidebar({
  items,
  counts,
  logoText,
  userName,
  roleLabel,
}: {
  items: PanelNavItem[];
  counts: Partial<Record<string, number>>;
  logoText: string;
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = usePanelUi();

  const nav = (
    <>
      <div className={`flex items-center gap-2 px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && <span className="truncate text-sm font-semibold tracking-wide">{logoText}</span>}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground hidden shrink-0 rounded-md p-1.5 transition-colors md:inline-flex"
        >
          <Icon d={collapsed ? ICON_PATHS.chevronRight : ICON_PATHS.chevronLeft} className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-4 flex flex-col gap-0.5 px-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const count = counts[item.key];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <Icon d={ICON_PATHS[item.icon]} className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!!count && (
                  <span className="bg-destructive text-destructive-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={`border-border mt-auto flex items-center gap-2 border-t px-3 py-3 ${collapsed ? "justify-center" : ""}`}>
        <span className="bg-secondary text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          {initials(userName)}
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-muted-foreground truncate text-xs">Signed in{roleLabel ? ` · ${roleLabel}` : ""}</p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <aside
        className={`bg-card border-border hidden h-full shrink-0 flex-col overflow-y-auto border-r py-4 transition-[width] duration-200 md:flex ${
          collapsed ? "w-16" : "w-[220px]"
        }`}
      >
        {nav}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="bg-card relative flex h-full w-[240px] flex-col py-4 shadow-xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
