"use client";

import { useState } from "react";
import { DIALOG_BODY, Dialog } from "@/components/panel/Dialog";
import { Pill, type Tone } from "@/components/panel/ui";
import type { ProofView } from "@/features/orders/staff-service";
import { ProofImage } from "./ProofImage";

const PROOF_TONES: Record<ProofView["status"], Tone> = { submitted: "need_review", verified: "completed", rejected: "rejected" };

/** Every payment screenshot of the order, newest first: purpose, status and date; a tap shows it large. */
export function ProofList({ proofs }: { proofs: ProofView[] }) {
  const [viewing, setViewing] = useState<ProofView | null>(null);

  return (
    <>
      <ul className="divide-border -my-3 divide-y">
        {proofs.map((proof) => (
          <li key={proof.id} className="flex gap-4 py-3">
            <button
              type="button"
              onClick={() => setViewing(proof)}
              aria-label={`View the ${proof.purposeLabel.toLowerCase()} screenshot`}
              className="bg-muted border-border h-20 w-16 shrink-0 overflow-hidden rounded-md border transition hover:opacity-80"
            >
              {/* A private, authenticated file: next/image's loader only serves /media. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/proof/${proof.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{proof.purposeLabel}</p>
                <Pill tone={PROOF_TONES[proof.status]}>{proof.statusLabel}</Pill>
              </div>
              <p className="text-muted-foreground mt-1">Uploaded {proof.uploadedAt}</p>
              {proof.reviewed && <p className="text-muted-foreground">Checked by {proof.reviewed}</p>}
              {proof.rejectionReason && <p className="mt-1">Reason: {proof.rejectionReason}</p>}
            </div>
          </li>
        ))}
      </ul>
      {viewing && (
        <Dialog title={`${viewing.purposeLabel} screenshot`} description={`${viewing.statusLabel} · uploaded ${viewing.uploadedAt}`} onClose={() => setViewing(null)} wide>
          <div className={DIALOG_BODY}>
            <ProofImage proofId={viewing.id} alt={`${viewing.purposeLabel} payment screenshot`} className="max-h-[60dvh]" />
          </div>
        </Dialog>
      )}
    </>
  );
}
