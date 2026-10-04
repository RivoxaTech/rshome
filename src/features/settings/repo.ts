import { inArray } from "drizzle-orm";
import { db, type DbClient } from "@/server/db/client";
import { settings } from "@/server/db/schema/settings";

export type SettingRow = { key: string; value: string; updatedAt: Date };

/** The rows for `keys` that exist (a missing key simply isn't returned), with `updated_at` for the panel's version check. */
export function getSettingRows(keys: readonly string[], client: DbClient = db): Promise<SettingRow[]> {
  if (keys.length === 0) return Promise.resolve([]);
  return client.select({ key: settings.key, value: settings.value, updatedAt: settings.updatedAt }).from(settings).where(inArray(settings.key, [...keys]));
}

/** `SELECT … FOR UPDATE` on the rows a panel save touches: the version check and the write happen under this lock. */
export function lockSettingRows(tx: DbClient, keys: readonly string[]): Promise<SettingRow[]> {
  if (keys.length === 0) return Promise.resolve([]);
  return tx.select({ key: settings.key, value: settings.value, updatedAt: settings.updatedAt }).from(settings).where(inArray(settings.key, [...keys])).for("update");
}

/** Creates or replaces one key's JSON text, stamping `updated_at` explicitly so every key saved together shares one version. */
export async function upsertSetting(tx: DbClient, key: string, value: unknown, now: Date): Promise<void> {
  const json = JSON.stringify(value);
  await tx
    .insert(settings)
    .values({ key, value: json, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { value: json, updatedAt: now } });
}
