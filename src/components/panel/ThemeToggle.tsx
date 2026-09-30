"use client";

import { useState } from "react";
import { PanelIcon } from "./icons";
import { PANEL_THEME_COOKIE, type PanelTheme } from "./theme";
import { ICON_BUTTON, Tooltip } from "./ui";

/**
 * Light or dark (C21): switches the panel's root at once and remembers the choice in a cookie,
 * which the panel layout reads, so the next page arrives in the same theme.
 */
export function ThemeToggle({ initial }: { initial: PanelTheme }) {
  const [theme, setTheme] = useState(initial);
  const next: PanelTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;

  function toggle() {
    document.querySelector("[data-panel]")?.setAttribute("data-theme", next);
    document.cookie = `${PANEL_THEME_COOKIE}=${next}; path=/panel; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  return (
    <Tooltip label={label}>
      <button type="button" onClick={toggle} aria-label={label} className={ICON_BUTTON}>
        <PanelIcon name={theme === "dark" ? "sun" : "moon"} />
      </button>
    </Tooltip>
  );
}
