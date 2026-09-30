"use client";

import { PanelIcon } from "./icons";
import { usePanelFrame } from "./PanelFrame";
import { PANEL_THEME_COOKIE, savePanelCookie, type PanelTheme } from "./theme";
import { ICON_BUTTON, Tooltip } from "./ui";

/**
 * Light or dark (C21): switches the panel's root at once and remembers the choice in a cookie,
 * which the panel layout reads, so the next page arrives in the same theme. The choice lives in
 * the frame, so every page's header shows the same one.
 */
export function ThemeToggle() {
  const { theme, setTheme } = usePanelFrame();
  const next: PanelTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;

  function toggle() {
    document.querySelector("[data-panel]")?.setAttribute("data-theme", next);
    savePanelCookie(PANEL_THEME_COOKIE, next);
    setTheme(next);
  }

  return (
    <Tooltip label={label}>
      <button type="button" onClick={toggle} aria-label={label} className={ICON_BUTTON}>
        <PanelIcon name={theme === "dark" ? "sun" : "moon"} className="size-[18px]" />
      </button>
    </Tooltip>
  );
}
