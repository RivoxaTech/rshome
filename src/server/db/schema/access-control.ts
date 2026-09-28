import {
  bigint,
  boolean,
  char,
  datetime,
  index,
  int,
  mysqlTable,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core";

export const roles = mysqlTable("roles", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const permissions = mysqlTable("permissions", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
});

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleId: bigint("role_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => roles.id),
    permissionId: bigint("permission_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const users = mysqlTable(
  "users",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    email: varchar("email", { length: 191 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    roleId: bigint("role_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => roles.id),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: datetime("last_login_at"),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: datetime("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("users_role_id_idx").on(table.roleId)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: char("id", { length: 64 }).primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    expiresAt: datetime("expires_at").notNull(),
    lastSeenAt: datetime("last_seen_at").notNull().$defaultFn(() => new Date()),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const rateLimits = mysqlTable("rate_limits", {
  bucket: varchar("bucket", { length: 191 }).primaryKey(),
  count: int("count", { unsigned: true }).notNull().default(0),
  windowEndsAt: datetime("window_ends_at").notNull(),
});
