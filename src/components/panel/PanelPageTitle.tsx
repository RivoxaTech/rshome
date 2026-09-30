"use client";

import { useEffect } from "react";
import { usePanelUi } from "@/components/panel/PanelUiContext";

/** Sets the header's title (PanelHeader) from inside a page; renders nothing. */
export function PanelPageTitle({ title }: { title: string }) {
  const { setTitle } = usePanelUi();
  useEffect(() => setTitle(title), [title, setTitle]);
  return null;
}
