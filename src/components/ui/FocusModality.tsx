"use client";

import { useEffect } from "react";

/**
 * Records whether the last input was a pointer or the keyboard on <html data-input>, so
 * theme.css can show the focus ring only for keyboard users. Browsers disagree on when
 * :focus-visible matches after a click followed by a client-side navigation, so :focus-visible
 * alone still left a ring on a clicked link in some of them.
 */
export function FocusModality() {
  useEffect(() => {
    const root = document.documentElement;
    const onPointerDown = () => {
      root.dataset.input = "pointer";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) root.dataset.input = "keyboard";
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}
