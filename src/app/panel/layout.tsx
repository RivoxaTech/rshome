import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getPanelTheme } from "@/app/panel/panel-prefs";
import { noindexRobots } from "@/features/seo/metadata";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

/** Defense-in-depth alongside robots.txt's `/panel` disallow (REQUIREMENTS SF-10) — the panel is auth-gated regardless. */
export const metadata: Metadata = { robots: noindexRobots };

/**
 * Wraps every `/panel` route (login, 403, the protected app). `data-panel` scopes the panel's
 * Inter/no-serif rules and `data-theme` scopes the dark palette (theme.css); both live on this
 * div, never on `<html>`, so the storefront is untouched. `ThemeToggle` flips `data-theme` here
 * directly and writes the same cookie `getPanelTheme` reads, so a reload never flashes.
 */
export default async function PanelRootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getPanelTheme();

  return (
    <div
      id="panel-shell"
      data-panel
      data-theme={theme}
      className={`${inter.variable} bg-background text-foreground h-dvh`}
    >
      {children}
    </div>
  );
}
