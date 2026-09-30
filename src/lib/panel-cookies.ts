/**
 * Cookie names and types shared between the server-read preferences (`app/panel/panel-prefs.ts`,
 * which imports `next/headers`) and the client toggles (`PanelUiContext.tsx`) that write them.
 * Kept apart from `panel-prefs.ts` so a client component can import this without pulling in
 * `next/headers`, which Next.js refuses to bundle for the client.
 */
export const PANEL_THEME_COOKIE = "panel_theme";
export const PANEL_SIDEBAR_COOKIE = "panel_sidebar";

export type PanelTheme = "light" | "dark";
