"use client";

import { useState } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

/** The panel forms' plain text input look (`components/panel/FormField.tsx#inputClass`), kept local here so this shared UI component doesn't depend on a panel-only module. */
const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 pr-9 text-sm focus:ring-2 focus:outline-none";

/** A password field with a show/hide eye toggle — the login form and the account page's change-password form both use this. */
export function PasswordInput({
  id,
  name,
  autoComplete,
  required,
  "aria-invalid": ariaInvalid,
}: {
  id: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  "aria-invalid"?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={ariaInvalid}
        className={inputClass}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center px-2.5"
      >
        <Icon d={visible ? ICON_PATHS.eyeOff : ICON_PATHS.eye} className="h-4 w-4" />
      </button>
    </div>
  );
}
