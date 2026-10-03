import type { DbClient } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema/audit";

/**
 * One audit row (CLAUDE.md #10); the snapshots are stored as JSON text (DATABASE.md DB2).
 * `userId` is null for a system write with no acting user (S21: `notify.failed`).
 *
 * Secrets never go in here as they are: a caller whose values include something the audit viewer
 * must not expose masks them first — bank account numbers and IBANs through
 * `features/settings/audit-mask.ts` (last four characters only, S14), passwords not at all.
 */
export async function insertAuditLog(
  tx: DbClient,
  entry: { userId: number | null; action: string; entity: string; entityId: string | number; oldValues: object | null; newValues: object; createdAt: Date },
): Promise<void> {
  await tx.insert(auditLogs).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: String(entry.entityId),
    oldValues: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
    newValues: JSON.stringify(entry.newValues),
    createdAt: entry.createdAt,
  });
}
