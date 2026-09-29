"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

/** Mirrors the server's limits (ARCHITECTURE.md §4.4) so obvious mistakes show before uploading. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type UploadState =
  | { step: "idle"; error: string | null }
  | { step: "uploading"; progress: number }
  | { step: "done" };

/** XMLHttpRequest rather than fetch: only it reports upload progress. */
function send(endpoint: string, file: File, onProgress: (fraction: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => resolve({ status: request.status, body: request.response });
    request.onerror = () => reject(new Error("Network error"));
    const form = new FormData();
    form.append("file", file);
    request.send(form);
  });
}

function errorOf(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return "The upload didn't work. Please try again.";
}

/**
 * The payment screenshot picker, at checkout and on the order page: choose from the camera roll
 * (no `capture`, so phones offer the photo library), see a preview and the upload progress, and
 * get a plain-language error. `onUploaded` receives the server's JSON body.
 */
export function ProofUpload({
  id,
  endpoint,
  label,
  error = null,
  onUploaded,
  onChange,
}: {
  id: string;
  endpoint: string;
  label: string;
  /** An error from outside, e.g. the order form reporting an expired upload. */
  error?: string | null;
  onUploaded: (body: unknown) => void;
  /** Called when the customer picks a new file, before it uploads. */
  onChange?: () => void;
}) {
  const [state, setState] = useState<UploadState>({ step: "idle", error });
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    onChange?.();

    if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
      setPreview(null);
      setState({ step: "idle", error: "Please choose a JPG, PNG or WebP image." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setPreview(null);
      setState({ step: "idle", error: "This image is larger than 5 MB. Please choose a smaller one." });
      return;
    }

    setPreview(URL.createObjectURL(file));
    setState({ step: "uploading", progress: 0 });
    try {
      const response = await send(endpoint, file, (progress) => setState({ step: "uploading", progress }));
      if (response.status >= 200 && response.status < 300) {
        setState({ step: "done" });
        onUploaded(response.body);
      } else {
        setState({ step: "idle", error: errorOf(response.body) });
      }
    } catch {
      setState({ step: "idle", error: "We couldn't reach the server. Check your connection and try again." });
    }
  }

  const uploading = state.step === "uploading";
  const shownError = state.step === "idle" ? state.error : null;

  return (
    <div>
      <p className="text-muted-foreground text-[10px] tracking-[0.28em] uppercase">{label}</p>
      <div className={`mt-3 flex items-center gap-4 border px-4 py-4 ${shownError ? "border-destructive" : "border-espresso/30"}`}>
        <div className="bg-muted flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden">
          {preview ? (
            // A local blob of the customer's own file: next/image has nothing to optimise here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your payment screenshot" className="h-full w-full object-cover" />
          ) : (
            <Icon d={ICON_PATHS.image} className="text-muted-foreground h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {state.step === "done" ? (
            <p className="flex items-center gap-2 text-xs">
              <Icon d={ICON_PATHS.check} className="h-4 w-4" />
              Screenshot uploaded
            </p>
          ) : uploading ? (
            <div role="status" aria-live="polite">
              <p className="text-xs">Uploading… {Math.round(state.progress * 100)}%</p>
              <div className="bg-border mt-2 h-0.5 w-full">
                <div className="bg-espresso h-full transition-[width]" style={{ width: `${state.progress * 100}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs leading-relaxed">A screenshot or photo of the transfer. JPG, PNG or WebP, up to 5 MB.</p>
          )}
          <label
            htmlFor={id}
            className={`hover:border-champagne hover:text-champagne mt-3 inline-block cursor-pointer border-b border-espresso/30 pb-1 text-[10px] tracking-[0.28em] uppercase transition-colors has-[:focus-visible]:border-champagne ${
              uploading ? "pointer-events-none opacity-40" : ""
            }`}
          >
            {preview ? "Choose a different screenshot" : "Choose screenshot"}
            <input
              id={id}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              disabled={uploading}
              onChange={onPick}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? `${id}-error` : undefined}
              className="sr-only"
            />
          </label>
        </div>
      </div>
      {shownError && (
        <p id={`${id}-error`} role="alert" className="text-destructive mt-2 text-xs leading-relaxed">
          {shownError}
        </p>
      )}
    </div>
  );
}
