import { bigint, datetime, index, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { users } from "./access-control";

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).references(() => users.id),
    action: varchar("action", { length: 50 }).notNull(),
    entity: varchar("entity", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 50 }).notNull(),
    oldValues: text("old_values"),
    newValues: text("new_values"),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entity, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);
