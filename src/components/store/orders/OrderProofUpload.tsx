"use client";

import { useRouter } from "next/navigation";
import type { ProofPurpose } from "@/features/orders/status";
import { ProofUpload } from "./ProofUpload";

/** The order page's screenshot upload; the page re-reads the order once it's in, to show it under review. */
export function OrderProofUpload({ orderNumber, purpose }: { orderNumber: string; purpose: ProofPurpose }) {
  const router = useRouter();
  return (
    <ProofUpload
      id="order-proof"
      endpoint={`/api/orders/${encodeURIComponent(orderNumber)}/proofs?purpose=${purpose}`}
      label={purpose === "delivery" ? "Delivery charge screenshot" : "Payment screenshot"}
      onUploaded={() => router.refresh()}
    />
  );
}
