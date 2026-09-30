"use client";

import { PanelIcon } from "./icons";
import { usePanelFrame } from "./PanelFrame";
import { ICON_BUTTON } from "./ui";

/** The header's first button: folds the sidebar on a desktop, opens the menu drawer below `lg`. */
export function SidebarToggle() {
  const { collapsed, toggleCollapsed, openDrawer, drawerOpen, waiting } = usePanelFrame();
  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        aria-controls="panel-drawer"
        className={`${ICON_BUTTON} relative lg:hidden`}
      >
        <PanelIcon name="menu" className="size-5" />
        {waiting > 0 && <span aria-hidden="true" className="bg-accent ring-card absolute top-2 right-2 size-2 rounded-full ring-2" />}
      </button>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
        className={`${ICON_BUTTON} max-lg:hidden`}
      >
        <PanelIcon name="sidebar" className="size-[18px]" />
      </button>
    </>
  );
}
