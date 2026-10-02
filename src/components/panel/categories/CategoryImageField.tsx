"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

/**
 * Uploads through `/api/panel/uploads` as soon as a file is picked (a Route Handler, not the
 * Server Action that saves the rest of the form — Server Actions cap their body at 1MB by
 * default, and a photo easily exceeds that). The hidden `imagePath` input carries the result the
 * save action actually needs; removing the file here only clears that input; the old file on disk
 * is only deleted once the save that replaces or clears it actually commits (features/catalog/staff-service.ts).
 */
export function CategoryImageField({ name, initialPath, error }: { name: string; initialPath: string | null; error?: string }) {
  const [path, setPath] = useState(initialPath);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/panel/uploads", { method: "POST", body });
      const data = (await response.json()) as { path?: string; error?: string };
      if (!response.ok || !data.path) {
        setUploadError(data.error ?? "Couldn't upload that image.");
        return;
      }
      setPath(data.path);
    } catch {
      setUploadError("Couldn't upload that image. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Image</label>
      <input type="hidden" name={name} value={path ?? ""} />
      <div className="flex items-center gap-3">
        {path ? (
          <Image src={path} alt="" width={80} height={80} className="h-20 w-20 rounded-lg object-cover" />
        ) : (
          <div className="bg-muted text-muted-foreground flex h-20 w-20 shrink-0 items-center justify-center rounded-lg">
            <Icon d={ICON_PATHS.image} className="h-6 w-6" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="border-input hover:bg-secondary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              <Icon d={ICON_PATHS.upload} className="h-3.5 w-3.5" />
              {busy ? "Uploading…" : path ? "Replace" : "Upload image"}
            </button>
            {path && (
              <button
                type="button"
                onClick={() => setPath(null)}
                className="text-muted-foreground hover:text-destructive text-xs font-medium"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">WebP, up to 8 MB. Shown on the home page&apos;s Collections cards.</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      {(uploadError || error) && <p className="text-destructive text-xs">{uploadError ?? error}</p>}
    </div>
  );
}
