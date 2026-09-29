import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/server/env";

/**
 * Payment screenshot files under UPLOAD_DIR/proofs (ARCHITECTURE.md §4.4). A checkout upload
 * waits in `pending/` until its order is placed; an order's proofs live in `YYYY/MM/` (UTC).
 * The DB stores the path relative to UPLOAD_DIR. Names are random, never the customer's.
 */
const PROOFS_DIR = path.join(env.UPLOAD_DIR, "proofs");
const PENDING_DIR = path.join(PROOFS_DIR, "pending");
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type StoredProof = { relativePath: string; fileSize: number };

function randomName(): string {
  return randomBytes(16).toString("hex");
}

function pendingPath(name: string): string {
  return path.join(PENDING_DIR, `${name}.webp`);
}

function finalRelativePath(name: string, now: Date): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return ["proofs", String(now.getUTCFullYear()), month, `${name}.webp`].join("/");
}

/** Through a temp file and a rename, so a half-written file never carries the final name. */
async function writeAtomically(filePath: string, data: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tempPath, data);
  await rename(tempPath, filePath);
}

/** The file for a stored relative path, or null if it would fall outside UPLOAD_DIR/proofs. */
export function proofFilePath(relativePath: string): string | null {
  const absolute = path.resolve(env.UPLOAD_DIR, relativePath);
  return absolute.startsWith(PROOFS_DIR + path.sep) ? absolute : null;
}

/** Stores a checkout upload until its order is placed; returns the random name. */
export async function savePendingProof(webp: Buffer): Promise<string> {
  const name = randomName();
  await writeAtomically(pendingPath(name), webp);
  return name;
}

/** Moves a pending upload to its permanent place; null when it is gone (already used, or swept). */
export async function promotePendingProof(name: string, now: Date): Promise<StoredProof | null> {
  const relativePath = finalRelativePath(name, now);
  const target = path.join(env.UPLOAD_DIR, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await rename(pendingPath(name), target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return { relativePath, fileSize: (await stat(target)).size };
}

/**
 * Undoes `promotePendingProof` when the order transaction fails afterwards, so the deadlock retry
 * or the customer's next submit can still use the upload. Deleted outright if it can't go back.
 */
export async function returnProofToPending(name: string, proof: StoredProof): Promise<void> {
  try {
    await rename(path.join(env.UPLOAD_DIR, proof.relativePath), pendingPath(name));
  } catch {
    await deleteProofFile(proof.relativePath);
  }
}

/** Stores a proof for an existing order straight in its permanent place. */
export async function saveProof(webp: Buffer, now: Date): Promise<StoredProof> {
  const relativePath = finalRelativePath(randomName(), now);
  await writeAtomically(path.join(env.UPLOAD_DIR, relativePath), webp);
  return { relativePath, fileSize: webp.length };
}

export async function deleteProofFile(relativePath: string): Promise<void> {
  try {
    await unlink(path.join(env.UPLOAD_DIR, relativePath));
  } catch {
    // Already gone.
  }
}

/**
 * Deletes checkout uploads older than a day that never became part of an order (abandoned
 * checkouts; their tokens expired long before). Runs on each checkout upload; errors are
 * ignored, since the next upload tries again.
 */
export async function sweepPendingProofs(now: Date): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(PENDING_DIR);
  } catch {
    return;
  }
  for (const entry of entries) {
    const filePath = path.join(PENDING_DIR, entry);
    try {
      if (now.getTime() - (await stat(filePath)).mtimeMs > PENDING_MAX_AGE_MS) await unlink(filePath);
    } catch {
      // Removed meanwhile.
    }
  }
}
