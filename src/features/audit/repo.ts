import type { DbClient } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema/audit";

/** One audit row (CLAUDE.md #10); the snapshots are stored as JSON text (DATABASE.md DB2). */
export async function insertAuditLog(
  tx: DbClient,
  entry: { userId: number; action: string; entity: string; entityId: string | number; oldValues: object | null; newValues: object; createdAt: Date },
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
