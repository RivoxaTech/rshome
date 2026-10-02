"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

/**
 * Uploads through `/api/panel/uploads` as soon as a file is picked (a Route Handler, not the
 * Server Action that saves the rest of the form — Server Actions cap their body at 1MB by
 * default, and a photo easily exceeds that). Hidden inputs carry the result the save action
 * actually needs: `${name}` (the path), and — when the save writes a `product_images` row, which
 * requires non-null dimensions, unlike `categories.image_path` — `${name}Width`/`${name}Height`
 * too. Removing the file here only clears those inputs; the old file on disk is only deleted once
 * the save that replaces or clears it actually commits (features/catalog/*-staff-service.ts).
 */
export function MediaImageField({
  name,
  subdir,
  initialPath,
  initialWidth = null,
  initialHeight = null,
  helpText,
  error,
}: {
  name: string;
  subdir: "categories" | "products";
  initialPath: string | null;
  initialWidth?: number | null;
  initialHeight?: number | null;
  helpText: string;
  error?: string;
}) {
  const [path, setPath] = useState(initialPath);
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("subdir", subdir);
      const response = await fetch("/api/panel/uploads", { method: "POST", body });
      const data = (await response.json()) as { path?: string; width?: number; height?: number; error?: string };
      if (!response.ok || !data.path) {
        setUploadError(data.error ?? "Couldn't upload that image.");
        return;
      }
      setPath(data.path);
      setWidth(data.width ?? null);
      setHeight(data.height ?? null);
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
      <input type="hidden" name={`${name}Width`} value={width ?? ""} />
      <input type="hidden" name={`${name}Height`} value={height ?? ""} />
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
                onClick={() => {
                  setPath(null);
                  setWidth(null);
                  setHeight(null);
                }}
                className="text-muted-foreground hover:text-destructive text-xs font-medium"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">{helpText}</p>
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
