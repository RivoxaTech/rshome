"use client";

import { useState } from "react";

/**
 * A payment screenshot thumbnail (about 64px, S9) that opens a large viewer dialog on click
 * (`/api/files/proof/[id]`, authenticated) — in the screenshots list and in the review card, so
 * checking the amount always means enlarging it first, never eyeballing a squashed preview.
 */
export function ProofImage({ proofId, label }: { proofId: number; label: string }) {
  const [enlarged, setEnlarged] = useState(false);
  const src = `/api/files/proof/${proofId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setEnlarged(true)}
        className="border-border block h-16 w-16 shrink-0 overflow-hidden rounded-md border"
        aria-label={`View ${label} full size`}
      >
        {/* Authenticated, non-public path: a plain <img>, not next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className="h-full w-full object-cover" />
      </button>

      {enlarged && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" onClick={() => setEnlarged(false)}>
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} className="relative max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}
