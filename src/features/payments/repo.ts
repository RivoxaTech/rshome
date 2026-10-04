import { desc, eq } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { orders, paymentProofs } from "@/server/db/schema/orders";
import type { PaymentStatus, ProofSummary } from "@/features/orders/status";

type PaymentProofInsert = typeof paymentProofs.$inferInsert;

/** Newest first, which is what the payment rules in `orders/status.ts` expect. */
export function getProofSummaries(orderId: number, client: DbClient = db): Promise<ProofSummary[]> {
  return client
    .select({ purpose: paymentProofs.purpose, status: paymentProofs.status, rejectionReason: paymentProofs.rejectionReason })
    .from(paymentProofs)
    .where(eq(paymentProofs.orderId, orderId))
    .orderBy(desc(paymentProofs.createdAt), desc(paymentProofs.id));
}

export async function insertPaymentProof(tx: DbClient, values: PaymentProofInsert): Promise<void> {
  await tx.insert(paymentProofs).values(values);
}

export async function getProofFilePath(proofId: number): Promise<string | null> {
  const [row] = await db.select({ filePath: paymentProofs.filePath }).from(paymentProofs).where(eq(paymentProofs.id, proofId)).limit(1);
  return row?.filePath ?? null;
}

/** The order row under `FOR UPDATE`, so two uploads to one order are checked one after the other. */
export async function lockOrder(tx: DbClient, orderId: number) {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row;
}

export async function setPaymentStatus(tx: DbClient, orderId: number, paymentStatus: PaymentStatus): Promise<void> {
  await tx.update(orders).set({ paymentStatus }).where(eq(orders.id, orderId));
}
