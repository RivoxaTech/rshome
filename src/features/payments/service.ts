import { z } from "zod";
import { features } from "@/config/features";
import { insertStatusHistory } from "@/features/checkout/repo";
import { getOrderByNumber } from "@/features/orders/repo";
import { paymentProgress, uploadPurpose, type ProofPurpose, type TimelineOrder } from "@/features/orders/status";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { consumeRateLimit } from "@/server/rate-limit";
import { isAllowedOrigin } from "@/server/request";
import { processProofImage, type ProofImageResult } from "@/server/storage/images";
import { deleteProofFile, saveProof, savePendingProof, sweepPendingProofs } from "@/server/storage/proofs";
import { PROOF_TOKEN_TTL_MS, encodeProofToken } from "./proof-token";
import { getProofFilePath, getProofSummaries, insertPaymentProof, lockOrder, setPaymentStatus } from "./repo";

/** ARCHITECTURE.md §4.4. The route rejects a larger body from its Content-Length, unread. */
const PROOF_MAX_BODY_BYTES = 5.5 * 1024 * 1024;
const PROOF_MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PROOFS_PER_ORDER = 5;
// Both upload routes share the per-IP bucket; the order-page route also counts per order.
const IP_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };
const ORDER_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

type UploadFailure = { ok: false; status: number; error: string };
const failure = (status: number, error: string): UploadFailure => ({ ok: false, status, error });

const TOO_MANY_ATTEMPTS = failure(429, "Too many uploads. Please try again in a few minutes.");

const IMAGE_FAILURES: Record<Extract<ProofImageResult, { ok: false }>["reason"], UploadFailure> = {
  unsupported_type: failure(415, "Please choose a JPG, PNG or WebP image."),
  too_many_pixels: failure(422, "This image is too large. Please upload a screenshot of the transfer instead."),
  unreadable: failure(422, "We couldn't read this image. Please choose another one."),
};

/**
 * What an upload route checks before reading a byte of the body: a same-origin request (the
 * CSRF guard, §4.5) and a declared size within the limit. Null when the upload may go ahead.
 */
export function refuseUploadRequest(request: Request): UploadFailure | null {
  if (!isAllowedOrigin(request)) return failure(403, "This upload is not allowed.");
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return failure(411, "Choose a screenshot to upload.");
  if (declared > PROOF_MAX_BODY_BYTES) return failure(413, "This image is larger than 5 MB. Please choose a smaller one.");
  return null;
}

/** The file part of the upload, read only once the rate limits have passed. */
type ReadFile = () => Promise<File | null>;

async function readProofImage(readFile: ReadFile): Promise<{ ok: true; webp: Buffer } | UploadFailure> {
  const file = await readFile();
  if (!file || file.size === 0) return failure(400, "Choose a screenshot to upload.");
  if (file.size > PROOF_MAX_FILE_BYTES) return failure(413, "This image is larger than 5 MB. Please choose a smaller one.");
  const image = await processProofImage(Buffer.from(await file.arrayBuffer()));
  return image.ok ? image : IMAGE_FAILURES[image.reason];
}

/**
 * The checkout screenshot (owner decision, S8), uploaded before the order exists: stored as a
 * pending file, answered with a signed token that `createOrder` exchanges for the file.
 */
export async function uploadCheckoutProof(readFile: ReadFile, ctx: { ip: string }): Promise<{ ok: true; token: string } | UploadFailure> {
  if (!(await consumeRateLimit(`proof:ip:${ctx.ip}`, IP_RATE_LIMIT)).allowed) return TOO_MANY_ATTEMPTS;

  const image = await readProofImage(readFile);
  if (!image.ok) return image;

  const now = new Date();
  await sweepPendingProofs(now);
  const fileName = await savePendingProof(image.webp);
  return { ok: true, token: encodeProofToken(fileName, new Date(now.getTime() + PROOF_TOKEN_TTL_MS), env.SESSION_SECRET) };
}

const purposeSchema = z.enum(["goods", "delivery"]);

/** Why this upload can't be taken right now, or null when it can. */
function refusalFor(order: TimelineOrder, purpose: ProofPurpose, proofCount: number): string | null {
  const progress = paymentProgress(order, features.deliveryChargeByTransfer);
  if (uploadPurpose(order, progress) !== purpose) {
    return purpose === "delivery" && progress.delivery === "awaiting_charge"
      ? "You can upload the delivery charge screenshot once we have confirmed the charge on WhatsApp."
      : "This order doesn't need a payment screenshot right now.";
  }
  if (proofCount >= MAX_PROOFS_PER_ORDER) return "This order already has the most screenshots we accept. Please message us on WhatsApp.";
  return null;
}

/**
 * A screenshot from the order page (ARCHITECTURE.md §4.4): the delivery charge once staff have
 * set it, or a new one after staff rejected the last. The caller has checked the Origin and the
 * order-access cookie. The file is written before the transaction and deleted if the row isn't.
 */
export async function uploadOrderProof(
  input: { orderNumber: string; purpose: unknown; readFile: ReadFile },
  ctx: { ip: string },
): Promise<{ ok: true; purpose: ProofPurpose } | UploadFailure> {
  if (!(await consumeRateLimit(`proof:ip:${ctx.ip}`, IP_RATE_LIMIT)).allowed) return TOO_MANY_ATTEMPTS;
  if (!(await consumeRateLimit(`proof:order:${input.orderNumber}`, ORDER_RATE_LIMIT)).allowed) return TOO_MANY_ATTEMPTS;

  const purpose = purposeSchema.safeParse(input.purpose);
  if (!purpose.success) return failure(400, "Choose what this screenshot pays for.");

  const order = await getOrderByNumber(input.orderNumber);
  if (!order) return failure(404, "Order not found.");
  // Checked before the image is processed, and again under lock below.
  const proofs = await getProofSummaries(order.id);
  const early = refusalFor({ ...order, proofs }, purpose.data, proofs.length);
  if (early) return failure(409, early);

  const image = await readProofImage(input.readFile);
  if (!image.ok) return image;

  const now = new Date();
  const stored = await saveProof(image.webp, now);
  try {
    const refusal = await db.transaction(async (tx) => {
      const locked = await lockOrder(tx, order.id);
      const lockedProofs = await getProofSummaries(order.id, tx);
      const reason = refusalFor({ ...locked, proofs: lockedProofs }, purpose.data, lockedProofs.length);
      if (reason) return reason;

      await insertPaymentProof(tx, {
        orderId: order.id,
        purpose: purpose.data,
        filePath: stored.relativePath,
        fileSize: stored.fileSize,
        status: "submitted",
        createdAt: now,
      });
      const note = purpose.data === "delivery" ? "Delivery charge screenshot uploaded" : "New payment screenshot uploaded";
      if (locked.paymentStatus === "proof_submitted") {
        await insertStatusHistory(tx, [{ orderId: order.id, kind: "note", note, changedBy: null, createdAt: now }]);
      } else {
        await setPaymentStatus(tx, order.id, "proof_submitted");
        await insertStatusHistory(tx, [
          { orderId: order.id, kind: "payment", fromStatus: locked.paymentStatus, toStatus: "proof_submitted", note, changedBy: null, createdAt: now },
        ]);
      }
      return null;
    });
    if (refusal) {
      await deleteProofFile(stored.relativePath);
      return failure(409, refusal);
    }
    return { ok: true, purpose: purpose.data };
  } catch (error) {
    await deleteProofFile(stored.relativePath);
    throw error;
  }
}

/** The stored path of a proof, looked up by id: the serving route never takes a path from the request. */
export function getProofFile(proofId: number): Promise<string | null> {
  return getProofFilePath(proofId);
}
