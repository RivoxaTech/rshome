import {
  bigint,
  boolean,
  char,
  datetime,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const shippingZones = mysqlTable("shipping_zones", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  mode: mysqlEnum("mode", ["flat", "quote"]).notNull(),
  flatRate: decimal("flat_rate", { precision: 12, scale: 2 }).notNull(),
  freeOverAmount: decimal("free_over_amount", { precision: 12, scale: 2 }),
  codEnabled: boolean("cod_enabled").notNull().default(false),
  isFallback: boolean("is_fallback").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const shippingZoneAreas = mysqlTable(
  "shipping_zone_areas",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    zoneId: bigint("zone_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => shippingZones.id),
    countryCode: char("country_code", { length: 2 }).notNull(),
    city: varchar("city", { length: 100 }),
  },
  (table) => [uniqueIndex("shipping_zone_areas_country_city_idx").on(table.countryCode, table.city)],
);
