/** The panel's light/dark choice (C21), kept in a cookie so the server renders it without a flash. */
export const PANEL_THEME_COOKIE = "panel_theme";
export type PanelTheme = "light" | "dark";

/** Whether the sidebar is folded to its icon rail (C22), kept in a cookie like the theme. */
export const PANEL_SIDEBAR_COOKIE = "panel_sidebar";

/** A panel preference cookie: the panel's paths only, for a year. */
export function savePanelCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/panel; max-age=31536000; samesite=lax`;
}
