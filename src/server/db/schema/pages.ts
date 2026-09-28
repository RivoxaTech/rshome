import { bigint, boolean, datetime, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

export const staticPages = mysqlTable("static_pages", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  slug: varchar("slug", { length: 191 }).notNull().unique(),
  title: varchar("title", { length: 150 }).notNull(),
  body: text("body").notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});
