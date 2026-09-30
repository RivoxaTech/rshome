/**
 * Server-read display preferences for the panel (theme, sidebar fold), stored as plain cookies.
 * The client toggles (`ThemeToggle`, `SidebarToggle`) write these same cookie names directly, so
 * the next request's server render already matches — no flash on reload.
 */
import { cookies } from "next/headers";
import { PANEL_SIDEBAR_COOKIE, PANEL_THEME_COOKIE, type PanelTheme } from "@/lib/panel-cookies";

export async function getPanelTheme(): Promise<PanelTheme> {
  const value = (await cookies()).get(PANEL_THEME_COOKIE)?.value;
  return value === "dark" ? "dark" : "light";
}

export async function getSidebarCollapsed(): Promise<boolean> {
  return (await cookies()).get(PANEL_SIDEBAR_COOKIE)?.value === "collapsed";
}
