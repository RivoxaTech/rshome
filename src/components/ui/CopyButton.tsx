"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, ICON_PATHS } from "./Icon";

const FEEDBACK_MS = 2000;

/** Falls back to the old selection API where `navigator.clipboard` is missing (plain http). */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Permission denied: try the fallback below.
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

/** An icon button that copies `value` and says "Copied" for a moment. */
export function CopyButton({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => window.clearTimeout(timeoutRef.current ?? undefined), []);

  async function onClick() {
    if (!(await copyText(value))) return;
    setCopied(true);
    window.clearTimeout(timeoutRef.current ?? undefined);
    timeoutRef.current = window.setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`hover:text-champagne inline-flex shrink-0 items-center gap-1.5 p-1.5 transition-colors ${className}`}
    >
      <Icon d={copied ? ICON_PATHS.check : ICON_PATHS.copy} className="h-4 w-4" />
      <span role="status" className={`text-[10px] tracking-[0.2em] uppercase ${copied ? "" : "sr-only"}`}>
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
