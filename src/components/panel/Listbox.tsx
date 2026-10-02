"use client";

import { useEffect, useId, useRef, useState } from "react";

export type ListboxOption = { value: string; label: string };
/** A non-interactive group header, interspersed with options — for a grouped list (e.g. categories by parent). */
export type ListboxGroupLabel = { groupLabel: string };
export type ListboxItem = ListboxOption | ListboxGroupLabel;

function isGroupLabel(item: ListboxItem): item is ListboxGroupLabel {
  return "groupLabel" in item;
}

/** A DOM-safe id for one option, stable across renders (used by `aria-activedescendant`). */
function optionId(base: string, value: string): string {
  return `${base}-option-${value.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * A `<select>`-alike whose open popup is our own DOM, not the browser's: a native `<select>`'s
 * popup is drawn by the host OS (confirmed: even Chrome's device-emulation mode renders it via
 * the desktop OS's own combo-box widget, not a real mobile picker), so it can never match the
 * panel's theme and can render with an odd/oversized box depending on the OS and display scaling
 * (ARCHITECTURE.md D52). Mirrors `SortMenu.tsx`'s `<details>`/outside-click/Escape pattern (no new
 * dependency). `name` carries the value via a hidden input, so this drops into a `<form>` exactly
 * like a `<select>`.
 *
 * Keyboard follows the ARIA "select-only" listbox pattern: focus always stays on the trigger
 * (`<summary>`); arrow keys move a highlighted option (`aria-activedescendant`, no real focus
 * move), Enter/Space opens when closed or confirms the highlighted option when open, Escape
 * closes — trivially "returning focus to the trigger" since focus never left it.
 */
export function Listbox({
  id,
  name,
  value,
  items,
  onChange,
  ariaLabel,
  disabled,
  placeholder,
  className = "",
}: {
  /** Set on the trigger (`<summary>`), so a `<label htmlFor={id}>` still focuses/opens it. */
  id?: string;
  name?: string;
  value: string;
  items: ListboxItem[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  /** Shown when `value` matches no item (e.g. "" before a required choice is made). */
  placeholder?: string;
  className?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const autoId = useId();
  const baseId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const selectableOptions = items.filter((item): item is ListboxOption => !isGroupLabel(item));
  const current = selectableOptions.find((item) => item.value === value);
  const [activeValue, setActiveValue] = useState<string | undefined>(current?.value ?? selectableOptions[0]?.value);

  // Tracks the native <details> open state (toggled by a click, or natively by Enter/Space on a
  // focused <summary>) so `aria-expanded` stays correct either way.
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const onToggle = () => setOpen(details.open);
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, []);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const onPointerDown = (event: PointerEvent) => {
      if (details.open && !details.contains(event.target as Node)) details.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Scrolls the highlighted option into view as the keyboard moves it (plain getElementById — no
  // CSS-selector escaping needed). `scrollIntoView` doesn't exist in jsdom (component tests), so
  // this is optional-chained on the method itself, not just the element lookup.
  useEffect(() => {
    if (!open || !activeValue || !listRef.current) return;
    document.getElementById(optionId(baseId, activeValue))?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeValue, baseId]);

  function select(next: string) {
    onChange(next);
    setActiveValue(next);
    if (detailsRef.current) {
      detailsRef.current.open = false;
      detailsRef.current.querySelector("summary")?.focus();
    }
  }

  function moveActive(delta: number) {
    if (selectableOptions.length === 0) return;
    const currentIndex = Math.max(
      0,
      selectableOptions.findIndex((option) => option.value === activeValue),
    );
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), selectableOptions.length - 1);
    setActiveValue(selectableOptions[nextIndex].value);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    const details = detailsRef.current;
    if (!details) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!details.open) {
        details.open = true;
        setActiveValue(current?.value ?? selectableOptions[0]?.value);
      } else {
        moveActive(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Handled explicitly rather than left to the native <summary> activation (Enter/Space
      // toggling a focused summary) — jsdom doesn't simulate that default action, and handling
      // it ourselves means real browsers and tests agree on exactly one code path.
      event.preventDefault();
      if (!details.open) {
        details.open = true;
        setActiveValue(current?.value ?? selectableOptions[0]?.value);
      } else if (activeValue !== undefined) {
        select(activeValue);
      }
      return;
    }
    if (event.key === "Home" && details.open) {
      event.preventDefault();
      if (selectableOptions[0]) setActiveValue(selectableOptions[0].value);
      return;
    }
    if (event.key === "End" && details.open) {
      event.preventDefault();
      if (selectableOptions.length > 0) setActiveValue(selectableOptions[selectableOptions.length - 1].value);
    }
  }

  return (
    <details ref={detailsRef} className={`relative ${disabled ? "pointer-events-none opacity-50" : ""} ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <summary
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-listbox`}
        aria-activedescendant={open && activeValue !== undefined ? optionId(baseId, activeValue) : undefined}
        onKeyDown={handleKeyDown}
        className="border-input bg-background text-foreground flex min-w-0 cursor-pointer list-none items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm [&::-webkit-details-marker]:hidden"
      >
        <span className={`truncate ${!current && placeholder ? "text-muted-foreground" : ""}`}>{current?.label ?? (placeholder && !value ? placeholder : value)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <ul
        ref={listRef}
        id={`${baseId}-listbox`}
        role="listbox"
        className="bg-background border-border shadow-soft absolute z-20 mt-1 max-h-64 min-w-full overflow-auto rounded-md border py-1 text-sm"
      >
        {items.map((item, index) =>
          isGroupLabel(item) ? (
            <li key={`group-${index}`} className="text-muted-foreground px-3 py-1 text-xs font-medium tracking-wide uppercase">
              {item.groupLabel}
            </li>
          ) : (
            <li key={item.value}>
              <button
                id={optionId(baseId, item.value)}
                type="button"
                role="option"
                aria-selected={item.value === value}
                onMouseEnter={() => setActiveValue(item.value)}
                onClick={() => select(item.value)}
                className={`flex w-full items-center px-3 py-1.5 text-left whitespace-nowrap ${item.value === value ? "font-medium" : ""} ${
                  item.value === activeValue ? "bg-secondary" : "hover:bg-secondary"
                }`}
              >
                {item.label}
              </button>
            </li>
          ),
        )}
      </ul>
    </details>
  );
}
