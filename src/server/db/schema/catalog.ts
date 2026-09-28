import {
  bigint,
  boolean,
  datetime,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";

export const categories = mysqlTable(
  "categories",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    parentId: bigint("parent_id", { mode: "number", unsigned: true }).references(
      (): AnyMySqlColumn => categories.id,
    ),
    name: varchar("name", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 191 }).notNull().unique(),
    description: text("description"),
    imagePath: varchar("image_path", { length: 255 }),
    sortOrder: int("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: datetime("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("categories_parent_id_idx").on(table.parentId),
    index("categories_active_sort_idx").on(table.isActive, table.sortOrder),
  ],
);

export const products = mysqlTable(
  "products",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    categoryId: bigint("category_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => categories.id),
    name: varchar("name", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 191 }).notNull().unique(),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    shortDescription: varchar("short_description", { length: 500 }),
    description: text("description"),
    price: decimal("price", { precision: 12, scale: 2 }).notNull(),
    stock: int("stock", { unsigned: true }).notNull().default(0),
    weightGrams: int("weight_grams", { unsigned: true }),
    isFeatured: boolean("is_featured").notNull().default(false),
    status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("draft"),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: datetime("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("products_category_status_idx").on(table.categoryId, table.status),
    index("products_status_created_idx").on(table.status, table.createdAt),
    index("products_is_featured_idx").on(table.isFeatured),
  ],
);

export const productImages = mysqlTable(
  "product_images",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id),
    path: varchar("path", { length: 255 }).notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    alt: varchar("alt", { length: 255 }),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("product_images_product_sort_idx").on(table.productId, table.sortOrder)],
);
