import { bigint, datetime, mysqlEnum, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";

export const wholesaleInquiries = mysqlTable("wholesale_inquiries", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  business: varchar("business", { length: 150 }),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 191 }),
  itemsOfInterest: text("items_of_interest"),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "contacted", "closed"]).notNull().default("new"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});
