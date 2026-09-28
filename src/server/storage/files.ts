import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { env } from "@/server/env";

/** Ensures UPLOAD_DIR exists and is writable. Safe to call repeatedly. */
export async function ensureUploadDir(): Promise<boolean> {
  try {
    await mkdir(env.UPLOAD_DIR, { recursive: true });
    await access(env.UPLOAD_DIR, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
