import {
  bigint,
  char,
  datetime,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "./access-control";
import { productVariants, products } from "./catalog";
import { coupons } from "./promotions";
import { shippingZones } from "./shipping";

export const orders = mysqlTable(
  "orders",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    orderNumber: varchar("order_number", { length: 20 }).notNull().unique(),
    checkoutToken: char("checkout_token", { length: 36 }).notNull().unique(),
    customerName: varchar("customer_name", { length: 150 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    email: varchar("email", { length: 191 }),
    addressLine: varchar("address_line", { length: 255 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    state: varchar("state", { length: 100 }),
    postalCode: varchar("postal_code", { length: 20 }),
    country: char("country", { length: 2 }).notNull(),
    shippingZoneId: bigint("shipping_zone_id", { mode: "number", unsigned: true }).references(
      () => shippingZones.id,
    ),
    paymentMethod: mysqlEnum("payment_method", ["cod", "bank_transfer"]).notNull(),
    orderStatus: mysqlEnum("order_status", [
      "pending",
      "awaiting_shipping_quote",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "rejected",
    ])
      .notNull()
      .default("pending"),
    paymentStatus: mysqlEnum("payment_status", [
      "unpaid",
      "proof_submitted",
      "verified",
      "rejected",
      "cod_pending",
      "cod_collected",
    ]).notNull(),
    rejectionReason: text("rejection_reason"),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
    discountTotal: decimal("discount_total", { precision: 12, scale: 2 }).notNull(),
    couponId: bigint("coupon_id", { mode: "number", unsigned: true }).references(
      () => coupons.id,
    ),
    couponCode: varchar("coupon_code", { length: 50 }),
    couponDiscount: decimal("coupon_discount", { precision: 12, scale: 2 }).notNull(),
    shippingTotal: decimal("shipping_total", { precision: 12, scale: 2 }),
    shippingNote: varchar("shipping_note", { length: 255 }),
    total: decimal("total", { precision: 12, scale: 2 }).notNull(),
    displayCurrency: char("display_currency", { length: 3 }).notNull(),
    exchangeRate: decimal("exchange_rate", { precision: 12, scale: 4 }).notNull(),
    displayTotal: decimal("display_total", { precision: 12, scale: 2 }).notNull(),
    customerNote: text("customer_note"),
    courier: varchar("courier", { length: 100 }),
    trackingNote: varchar("tracking_note", { length: 255 }),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: datetime("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("orders_status_created_idx").on(table.orderStatus, table.createdAt),
    index("orders_payment_status_created_idx").on(table.paymentStatus, table.createdAt),
    index("orders_phone_idx").on(table.phone),
    index("orders_created_at_idx").on(table.createdAt),
  ],
);

export const orderItems = mysqlTable(
  "order_items",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => orders.id),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id),
    variantId: bigint("variant_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => productVariants.id),
    nameSnapshot: varchar("name_snapshot", { length: 150 }).notNull(),
    variantLabelSnapshot: varchar("variant_label_snapshot", { length: 150 }).notNull(),
    skuSnapshot: varchar("sku_snapshot", { length: 64 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
    discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).notNull(),
    quantity: int("quantity", { unsigned: true }).notNull(),
    lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [index("order_items_order_id_idx").on(table.orderId)],
);

export const paymentProofs = mysqlTable(
  "payment_proofs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => orders.id),
    filePath: varchar("file_path", { length: 255 }).notNull(),
    fileSize: int("file_size", { unsigned: true }).notNull(),
    status: mysqlEnum("status", ["submitted", "verified", "rejected"]).notNull().default("submitted"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: bigint("reviewed_by", { mode: "number", unsigned: true }).references(
      () => users.id,
    ),
    reviewedAt: datetime("reviewed_at"),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("payment_proofs_order_id_idx").on(table.orderId)],
);

export const orderStatusHistory = mysqlTable(
  "order_status_history",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    orderId: bigint("order_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => orders.id),
    kind: mysqlEnum("kind", ["order", "payment", "note"]).notNull(),
    fromStatus: varchar("from_status", { length: 50 }),
    toStatus: varchar("to_status", { length: 50 }),
    note: text("note"),
    changedBy: bigint("changed_by", { mode: "number", unsigned: true }).references(() => users.id),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("order_status_history_order_created_idx").on(table.orderId, table.createdAt)],
);
