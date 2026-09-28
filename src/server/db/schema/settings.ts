import { datetime, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

/** value is JSON, shaped and validated per key with Zod in the settings repo (features/settings). */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: datetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});
