"use client";

import { useState } from "react";
import { inputClass } from "@/components/panel/FormField";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { MIN_PASSWORD_LENGTH } from "@/features/users/schemas";

/** Unambiguous characters (no 0/O, 1/l/I), drawn from `crypto.getRandomValues`: 14 characters, well over the 8 minimum. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GENERATED_LENGTH = 14;

function generatePassword(): string {
  const bytes = new Uint32Array(GENERATED_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join("");
}

/**
 * The temporary password a Developer types or generates for someone else (S20): a plain text
 * field with a show/hide toggle (hidden by default so a shoulder-surfer sees nothing) and a
 * Generate button. The parent owns the value so it can show it once after the save succeeds;
 * the server never echoes it back.
 */
export function TemporaryPasswordField({ id, name, value, onChange, error }: { id: string; name: string; value: string; onChange: (next: string) => void; error?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            name={name}
            type={visible ? "text" : "password"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            aria-invalid={!!error}
            className={`${inputClass} w-full pr-9 font-mono`}
          />
          <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"} className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center px-2.5">
            <Icon d={visible ? ICON_PATHS.eyeOff : ICON_PATHS.eye} className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(generatePassword());
            setVisible(true);
          }}
          className="border-input hover:bg-secondary shrink-0 rounded-md border px-3 py-2 text-sm font-medium"
        >
          Generate
        </button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
