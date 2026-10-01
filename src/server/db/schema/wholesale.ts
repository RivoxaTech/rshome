import {
  bigint,
  date,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "./access-control";
import { products } from "./catalog";

export const wholesaleInquiries = mysqlTable("wholesale_inquiries", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  business: varchar("business", { length: 150 }),
  businessType: mysqlEnum("business_type", ["retail", "restaurant_cafe", "hotel", "event", "other"]).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 191 }),
  city: varchar("city", { length: 100 }).notNull(),
  neededByDate: date("needed_by_date"),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "contacted", "closed"]).notNull().default("new"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

/** items (repeatable rows) from the wholesale form. product_id is set only when the item matches the catalogue. */
export const wholesaleInquiryItems = mysqlTable(
  "wholesale_inquiry_items",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    inquiryId: bigint("inquiry_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => wholesaleInquiries.id),
    productId: bigint("product_id", { mode: "number", unsigned: true }).references(() => products.id),
    itemName: varchar("item_name", { length: 200 }).notNull(),
    quantity: int("quantity", { unsigned: true }).notNull(),
    /** Optional per-row note from the form (S17), e.g. "matte finish". */
    note: varchar("note", { length: 255 }),
  },
  (table) => [index("wholesale_inquiry_items_inquiry_id_idx").on(table.inquiryId)],
);

/**
 * Internal staff notes on an inquiry (S17). Status changes are written to `audit_logs` instead
 * (action `wholesale.status_change`) — the panel's Activity timeline merges both sources.
 */
export const wholesaleInquiryNotes = mysqlTable(
  "wholesale_inquiry_notes",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    inquiryId: bigint("inquiry_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => wholesaleInquiries.id),
    authorUserId: bigint("author_user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    note: text("note").notNull(),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("wholesale_inquiry_notes_inquiry_id_idx").on(table.inquiryId)],
);
