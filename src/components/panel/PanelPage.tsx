import Link from "next/link";
import type { ReactNode } from "react";
import { PanelIcon } from "./icons";
import { LogoutButton } from "./LogoutButton";
import { SidebarToggle } from "./SidebarToggle";
import { ThemeToggle } from "./ThemeToggle";

export type Crumb = { label: string; href?: string };

/**
 * A signed-in panel page (C22): the header bar with the sidebar toggle, the page's title or
 * breadcrumb (one crumb is the page's heading), an optional note, and the theme and logout icons;
 * then the content, the only part that scrolls. The content is fluid up to 1600 px, so a 13" and
 * a 24" screen look alike.
 */
export function PanelPage({ crumbs, note, children }: { crumbs: Crumb[]; note?: string; children: ReactNode }) {
  const single = crumbs.length === 1;
  return (
    <>
      <header className="bg-card border-border flex h-13 shrink-0 items-center gap-1 border-b px-2 sm:px-3">
        <SidebarToggle />
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
          {single ? (
            <h1 className="truncate text-[15px] font-semibold">{crumbs[0].label}</h1>
          ) : (
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex min-w-0 items-center gap-1 text-[13px]">
                {crumbs.map((crumb, index) => (
                  <li key={crumb.label} className={`flex min-w-0 items-center gap-1 ${index === crumbs.length - 1 ? "" : "max-sm:hidden"}`}>
                    {index > 0 && <PanelIcon name="chevronRight" className="text-muted-foreground size-3.5 shrink-0 max-sm:hidden" />}
                    {crumb.href ? (
                      <Link href={crumb.href} className="text-muted-foreground hover:text-foreground truncate transition-colors">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="truncate font-semibold">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {note && <p className="text-muted-foreground hidden truncate text-[13px] sm:block">{note}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <main className="relative flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </main>
    </>
  );
}
