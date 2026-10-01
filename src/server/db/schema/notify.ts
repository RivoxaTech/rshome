import { bigint, char, datetime, index, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { users } from "./access-control";

/**
 * One row per browser/device the owner enabled push notifications on (S21). `endpoint` can run to
 * 500 characters (too long for a plain unique index under utf8mb4 on MySQL 8 or MariaDB alike), so
 * `endpointHash` (SHA-256 hex, `features/notify/repo.ts`) carries the uniqueness instead.
 */
export const pushSubscriptions = mysqlTable(
  "push_subscriptions",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    endpoint: varchar("endpoint", { length: 500 }).notNull(),
    endpointHash: char("endpoint_hash", { length: 64 }).notNull().unique(),
    p256dh: varchar("p256dh", { length: 191 }).notNull(),
    auth: varchar("auth", { length: 191 }).notNull(),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
    lastUsedAt: datetime("last_used_at"),
  },
  (table) => [index("push_subscriptions_user_id_idx").on(table.userId)],
);
