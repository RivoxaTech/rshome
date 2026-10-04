/**
 * The audit viewer (S20, REQUIREMENTS DV-09, `audit.view`, Developer-only): a paginated,
 * newest-first list over `audit_logs` with filters by actor, action, entity, entity id and a
 * Karachi date range. Read-only — nothing here writes. Rows are handed to the page already
 * formatted (Karachi time, actor name or "System", labels), with the raw snapshots left as text
 * for the row's detail dialog to diff (`diff.ts`).
 */
import { KARACHI_OFFSET_MS, formatKarachiDateTime } from "@/lib/karachi-datetime";
import { auditActionLabel, auditEntityLabel } from "./actions";
import type { AuditListQuery } from "./schemas";
import { countAuditRows, listAuditActors, listAuditRows, type AuditFilter } from "./staff-repo";

export type AuditListItem = {
  id: number;
  at: string;
  /** The actor's name, or "System" for a row with no user (e.g. `notify.failed`). */
  actor: string;
  actorId: number | null;
  action: string;
  actionLabel: string;
  entity: string;
  entityLabel: string;
  entityId: string;
  oldValues: string | null;
  newValues: string | null;
};

const SYSTEM_ACTOR = "System";

/** "YYYY-MM-DD" (a Karachi calendar day) -> the UTC instant that day starts, plus `days` days. */
function karachiDayStart(date: string, days = 0): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days) - KARACHI_OFFSET_MS);
}

/** The URL query as the repo's filter: the Karachi dates become a `[from, to)` pair of UTC instants. */
function toAuditFilter(query: AuditListQuery): AuditFilter {
  return {
    user: query.user,
    action: query.action,
    entity: query.entity,
    entityId: query.entityId || undefined,
    from: query.from ? karachiDayStart(query.from) : undefined,
    to: query.to ? karachiDayStart(query.to, 1) : undefined,
  };
}

export async function listAuditLog(query: AuditListQuery): Promise<{ items: AuditListItem[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const filter = toAuditFilter(query);
  const total = await countAuditRows(filter);
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const rows = await listAuditRows(filter, page, query.pageSize);

  const items = rows.map((row) => ({
    id: row.id,
    at: formatKarachiDateTime(row.createdAt),
    actor: row.userId === null ? SYSTEM_ACTOR : (row.userName ?? `User #${row.userId}`),
    actorId: row.userId,
    action: row.action,
    actionLabel: auditActionLabel(row.action),
    entity: row.entity,
    entityLabel: auditEntityLabel(row.entity),
    entityId: row.entityId,
    oldValues: row.oldValues,
    newValues: row.newValues,
  }));

  return { items, total, page, pageSize: query.pageSize, pageCount };
}

export function listAuditActorOptions(): Promise<{ id: number; name: string }[]> {
  return listAuditActors();
}
