"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

/**
 * Elements marked `data-modal-shell` are the page behind every modal: they become `inert` while
 * one is open, so neither Tab nor a pointer can reach them. A modal therefore never renders
 * inside one (the panel overlays portal into `#panel-shell`, next to the frame; the cart drawer
 * is a sibling of the storefront shell).
 */
const SHELL_SELECTOR = "[data-modal-shell]";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]';

/** The open modals, innermost last: only the top one handles Esc and Tab. */
const openModals: HTMLElement[] = [];

function isTopModal(container: HTMLElement): boolean {
  return openModals[openModals.length - 1] === container;
}

function setShellsInert(inert: boolean): void {
  for (const shell of document.querySelectorAll(SHELL_SELECTOR)) {
    if (inert) shell.setAttribute("inert", "");
    else shell.removeAttribute("inert");
  }
}

/** Tab stops inside the modal, in document order. Options of a closed `Listbox` (`<details>`) are skipped, like the browser does. */
function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute("tabindex") === "-1" || element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
    const closedDetails = element.closest("details:not([open])");
    if (!closedDetails || !container.contains(closedDetails)) return true;
    return element.tagName === "SUMMARY" && element.parentElement === closedDetails;
  });
}

/**
 * Modal behaviour for a dialog, drawer or viewer (S22 QA-01): while `open`, focus moves into the
 * container (`initialFocus`, else the container itself, which needs `tabIndex={-1}`), Tab and
 * Shift+Tab wrap inside it, Esc calls `onClose`, and the page shells are `inert`. On close, focus
 * returns to the element that had it when the modal opened. Modals stack (a proof viewer opened
 * from a dialog): only the innermost one reacts to keys, and the shells stay inert until the last
 * one closes. `onClose` is an effect event, so a new inline callback on each render never re-runs
 * the effect (which would pull focus back to the container mid-typing).
 */
export function useModal({
  ref,
  open,
  onClose,
  initialFocus,
}: {
  ref: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
}): void {
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const container = ref.current;
    if (!open || !container) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openModals.push(container);
    if (openModals.length === 1) setShellsInert(true);

    // A drawer that transitions `visibility` is still hidden on the frame it opens, so a first
    // `focus()` can be refused; retry on the next frames until it sticks (the cart drawer).
    const target = initialFocus?.current ?? container;
    let frame = 0;
    const focusTarget = (attempt: number) => {
      target.focus();
      if (document.activeElement !== target && attempt < 10) frame = requestAnimationFrame(() => focusTarget(attempt + 1));
    };
    focusTarget(0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopModal(container)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const stops = focusables(container);
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && container.contains(active);
      if (stops.length === 0) {
        event.preventDefault();
        container.focus();
      } else if (event.shiftKey) {
        if (!inside || active === container || active === stops[0]) {
          event.preventDefault();
          stops[stops.length - 1].focus();
        }
      } else if (!inside || active === stops[stops.length - 1]) {
        event.preventDefault();
        stops[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      openModals.splice(openModals.indexOf(container), 1);
      if (openModals.length === 0) setShellsInert(false);
      // Only if focus is still ours (or was lost with the removed dialog): never steal it from
      // somewhere the user has already moved on to.
      const active = document.activeElement;
      const focusIsOurs = active === null || active === document.body || container.contains(active);
      if (focusIsOurs && opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, [ref, open, initialFocus]);
}
