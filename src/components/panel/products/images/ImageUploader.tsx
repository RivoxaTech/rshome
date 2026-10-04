"use client";

import { useRef, useState } from "react";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { MAX_PRODUCT_IMAGES } from "@/features/catalog/schemas";
import { addProductImageAction } from "@/app/panel/(protected)/products/[id]/actions";

type FileStatus = { id: number; name: string; progress: number; error: string | null; done: boolean };

/**
 * A multi-file picker and drop area (S10 phase 3b): each file uploads through the existing
 * `/api/panel/uploads` one at a time, with progress (XHR, since `fetch` has no upload-progress
 * event), then is added to the product through `addProductImageAction`. A refused add (max count,
 * duplicate path) is shown per file; the server itself deletes the now-orphaned upload
 * (`images-staff-service.ts#addProductImage`), so nothing is left behind here either way.
 */
export function ImageUploader({
  productId,
  remaining,
  onAdded,
  onError,
}: {
  productId: number;
  remaining: number;
  onAdded: () => void;
  onError: (message: string | null) => void;
}) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  function uploadOne(file: File): Promise<boolean> {
    const id = nextId.current++;
    setFiles((prev) => [...prev, { id, name: file.name, progress: 0, error: null, done: false }]);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/panel/uploads");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progress = Math.round((event.loaded / event.total) * 100);
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress } : f)));
      };
      xhr.onload = async () => {
        let data: { path?: string; width?: number; height?: number; error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = {};
        }
        if (xhr.status !== 201 || !data.path) {
          setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, error: data.error ?? "Couldn't upload that image.", done: true } : f)));
          resolve(false);
          return;
        }
        let result: Awaited<ReturnType<typeof addProductImageAction>>;
        try {
          result = await addProductImageAction(productId, { path: data.path, width: data.width, height: data.height });
        } catch {
          // A dropped connection or an expired session: the row must not sit at "uploading" forever (S22 BUG-14).
          setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, error: "Uploaded, but couldn't be added to the product. Reload and try again.", done: true } : f)));
          resolve(false);
          return;
        }
        if (!result.ok) {
          setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, error: result.error, done: true } : f)));
          resolve(false);
        } else {
          setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress: 100, done: true } : f)));
          resolve(true);
        }
      };
      xhr.onerror = () => {
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, error: "Couldn't upload that image. Check your connection and try again.", done: true } : f)));
        resolve(false);
      };
      const body = new FormData();
      body.set("file", file);
      body.set("subdir", "products");
      xhr.send(body);
    });
  }

  async function handleFiles(fileList: FileList | File[]) {
    onError(null);
    const incoming = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (incoming.length === 0) return;

    // `remaining` already reflects every image added so far (it's recomputed from the server's
    // own count after each `router.refresh()`), so this batch's allowance is just `remaining`
    // itself — not `remaining` minus this component's own all-time `files` state, which would
    // double-subtract a prior batch once the prop catches up.
    const allowed = Math.max(0, remaining);
    if (allowed === 0) {
      onError(`A product can have at most ${MAX_PRODUCT_IMAGES} images.`);
      return;
    }
    const toUpload = incoming.slice(0, allowed);
    if (incoming.length > toUpload.length) {
      onError(`Only ${allowed} more image${allowed === 1 ? "" : "s"} can be added (max ${MAX_PRODUCT_IMAGES} per product).`);
    }

    let addedAny = false;
    for (const file of toUpload) {
      if (await uploadOne(file)) addedAny = true;
    }
    if (addedAny) onAdded();
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        } ${remaining === 0 ? "opacity-50" : ""}`}
      >
        <Icon d={ICON_PATHS.upload} className="text-muted-foreground h-5 w-5" />
        <p className="text-sm">
          Drag photos here, or{" "}
          <button type="button" disabled={remaining === 0} onClick={() => inputRef.current?.click()} className="text-primary font-medium hover:underline disabled:no-underline disabled:opacity-50">
            choose files
          </button>
        </p>
        <p className="text-muted-foreground text-xs">
          WebP, JPEG or PNG, up to 8 MB each. {remaining} of {MAX_PRODUCT_IMAGES} slots left.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={remaining === 0}
        className="hidden"
        onChange={(event) => {
          // `.files` is a *live* FileList: clearing `.value` below empties it in place, so the
          // files must be copied out first — unlike `MediaImageField`'s single `?.[0]` File
          // reference, which stays valid once extracted.
          const list = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (list.length > 0) void handleFiles(list);
        }}
      />
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              {!file.done && <span className="text-muted-foreground tabular-nums">{file.progress}%</span>}
              {file.done && !file.error && <span className="text-emerald-600 dark:text-emerald-400">Added</span>}
              {file.error && <span className="text-destructive">{file.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
