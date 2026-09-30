"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PANEL_SIDEBAR_COOKIE, PANEL_THEME_COOKIE, type PanelTheme } from "@/lib/panel-cookies";

const ONE_YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

type PanelUiState = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  theme: PanelTheme;
  toggleTheme: () => void;
  title: string;
  setTitle: (title: string) => void;
};

const PanelUiCtx = createContext<PanelUiState | null>(null);

export function PanelUiProvider({
  initialCollapsed,
  initialTheme,
  children,
}: {
  initialCollapsed: boolean;
  initialTheme: PanelTheme;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [title, setTitle] = useState("");

  const value = useMemo<PanelUiState>(
    () => ({
      collapsed,
      toggleCollapsed: () =>
        setCollapsed((prev) => {
          const next = !prev;
          setCookie(PANEL_SIDEBAR_COOKIE, next ? "collapsed" : "open");
          return next;
        }),
      mobileOpen,
      setMobileOpen,
      theme,
      toggleTheme: () =>
        setTheme((prev) => {
          const next = prev === "dark" ? "light" : "dark";
          document.getElementById("panel-shell")?.setAttribute("data-theme", next);
          setCookie(PANEL_THEME_COOKIE, next);
          return next;
        }),
      title,
      setTitle,
    }),
    [collapsed, mobileOpen, theme, title],
  );

  return <PanelUiCtx.Provider value={value}>{children}</PanelUiCtx.Provider>;
}

export function usePanelUi(): PanelUiState {
  const ctx = useContext(PanelUiCtx);
  if (!ctx) throw new Error("usePanelUi must be used inside PanelUiProvider");
  return ctx;
}
