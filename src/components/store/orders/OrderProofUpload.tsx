"use client";

import { useRouter } from "next/navigation";
import type { ProofPurpose } from "@/features/orders/status";
import { ProofUpload } from "./ProofUpload";

/**
 * The order page's screenshot upload; the page re-reads the order once it's in, to show it under
 * review. A delivery-charge upload gets a WhatsApp-fallback note (D63): staff can't act on it
 * otherwise if the customer sends it there instead, since nothing lands in the panel to review.
 */
export function OrderProofUpload({
  orderNumber,
  purpose,
  whatsAppUrl,
}: {
  orderNumber: string;
  purpose: ProofPurpose;
  whatsAppUrl: string;
}) {
  const router = useRouter();
  return (
    <div>
      <ProofUpload
        id="order-proof"
        endpoint={`/api/orders/${encodeURIComponent(orderNumber)}/proofs?purpose=${purpose}`}
        label={purpose === "delivery" ? "Delivery charge screenshot" : "Payment screenshot"}
        onUploaded={() => router.refresh()}
      />
      {purpose === "delivery" && (
        <p className="text-destructive mt-3 text-xs leading-relaxed">
          Already sent this on{" "}
          <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            WhatsApp
          </a>
          ? No need to upload it here too — just let us know and we&apos;ll take it from there.
        </p>
      )}
    </div>
  );
}
