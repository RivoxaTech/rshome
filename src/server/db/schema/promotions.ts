import {
  bigint,
  boolean,
  datetime,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core";
import { orders } from "./orders";

export const discounts = mysqlTable("discounts", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  type: mysqlEnum("type", ["percent", "fixed"]).notNull(),
  value: decimal("value", { precision: 12, scale: 2 }).notNull(),
  targetType: mysqlEnum("target_type", ["all", "category", "product"]).notNull(),
  startsAt: datetime("starts_at"),
  endsAt: datetime("ends_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

/** target_id is a category or product id depending on discounts.target_type; no FK (target table varies). */
export const discountTargets = mysqlTable(
  "discount_targets",
  {
    discountId: bigint("discount_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => discounts.id),
    targetId: bigint("target_id", { mode: "number", unsigned: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.discountId, table.targetId] })],
);

export const coupons = mysqlTable("coupons", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  type: mysqlEnum("type", ["percent", "fixed"]).notNull(),
  value: decimal("value", { precision: 12, scale: 2 }).notNull(),
  minOrder: decimal("min_order", { precision: 12, scale: 2 }),
  maxDiscount: decimal("max_discount", { precision: 12, scale: 2 }),
  usageLimit: int("usage_limit", { unsigned: true }),
  perCustomerLimit: int("per_customer_limit", { unsigned: true }),
  usedCount: int("used_count", { unsigned: true }).notNull().default(0),
  startsAt: datetime("starts_at"),
  endsAt: datetime("ends_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const couponUsages = mysqlTable(
  "coupon_usages",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    couponId: bigint("coupon_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => coupons.id),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .unique()
      .references(() => orders.id),
    customerKey: varchar("customer_key", { length: 32 }).notNull(),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("coupon_usages_coupon_customer_idx").on(table.couponId, table.customerKey)],
);
