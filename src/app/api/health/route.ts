import { NextResponse } from "next/server";
import { pool } from "@/server/db/client";
import { ensureUploadDir } from "@/server/storage/files";

async function checkDb(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const [db, uploads] = await Promise.all([checkDb(), ensureUploadDir()]);
  const ok = db && uploads;
  return NextResponse.json({ db, uploads }, { status: ok ? 200 : 503 });
}
