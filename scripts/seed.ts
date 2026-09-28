import "../src/server/load-env";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ADMIN_DEFAULT_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  PERMISSIONS,
  type PermissionKey,
} from "../src/features/auth/permissions";
import { hashPassword } from "../src/server/auth/password";
import { db, pool } from "../src/server/db/client";
import { categories, products } from "../src/server/db/schema/catalog";
import {
  permissions as permissionsTable,
  rolePermissions,
  roles,
  users,
} from "../src/server/db/schema/access-control";
import { shippingZoneAreas, shippingZones } from "../src/server/db/schema/shipping";

const seedUsersEnvSchema = z.object({
  SEED_DEVELOPER_EMAIL: z.email(),
  SEED_DEVELOPER_PASSWORD: z.string().min(6),
  SEED_ADMIN_EMAIL: z.email(),
  SEED_ADMIN_PASSWORD: z.string().min(6),
});

async function seedPermissions() {
  const allKeys = Object.values(PERMISSIONS) as PermissionKey[];
  for (const key of allKeys) {
    await db
      .insert(permissionsTable)
      .values({ key, description: PERMISSION_DESCRIPTIONS[key] })
      .onDuplicateKeyUpdate({ set: { description: PERMISSION_DESCRIPTIONS[key] } });
  }
  console.log(`Upserted ${allKeys.length} permissions.`);
}

async function seedRoles() {
  await db
    .insert(roles)
    .values({ key: "developer", name: "Developer", isSystem: true })
    .onDuplicateKeyUpdate({ set: { name: "Developer", isSystem: true } });
  await db
    .insert(roles)
    .values({ key: "admin", name: "Admin", isSystem: false })
    .onDuplicateKeyUpdate({ set: { name: "Admin" } });
  console.log("Upserted roles: developer, admin.");
}

async function seedRolePermissions() {
  const roleRows = await db.select().from(roles);
  const developerRole = roleRows.find((r) => r.key === "developer")!;
  const adminRole = roleRows.find((r) => r.key === "admin")!;

  const permissionRows = await db.select().from(permissionsTable);
  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  const grants: { roleId: number; permissionId: number }[] = [];
  for (const permission of permissionRows) {
    grants.push({ roleId: developerRole.id, permissionId: permission.id });
  }
  for (const key of ADMIN_DEFAULT_PERMISSIONS) {
    const permissionId = permissionIdByKey.get(key);
    if (permissionId) grants.push({ roleId: adminRole.id, permissionId });
  }

  for (const grant of grants) {
    await db
      .insert(rolePermissions)
      .values(grant)
      // No-op update: makes the insert idempotent without an "insert ignore".
      .onDuplicateKeyUpdate({ set: { roleId: sql`role_id` } });
  }
  console.log(`Granted ${grants.length} role/permission pairs.`);
  return { developerRole, adminRole };
}

async function seedUsers(developerRoleId: number, adminRoleId: number) {
  const seedEnv = seedUsersEnvSchema.parse(process.env);

  const existing = await db
    .select({ email: users.email })
    .from(users)
    .where(sql`${users.email} IN (${seedEnv.SEED_DEVELOPER_EMAIL}, ${seedEnv.SEED_ADMIN_EMAIL})`);
  const existingEmails = new Set(existing.map((u) => u.email));

  if (!existingEmails.has(seedEnv.SEED_DEVELOPER_EMAIL)) {
    await db.insert(users).values({
      name: "Developer",
      email: seedEnv.SEED_DEVELOPER_EMAIL,
      passwordHash: await hashPassword(seedEnv.SEED_DEVELOPER_PASSWORD),
      roleId: developerRoleId,
    });
    console.log(`Created developer user ${seedEnv.SEED_DEVELOPER_EMAIL}.`);
  } else {
    console.log(`Developer user ${seedEnv.SEED_DEVELOPER_EMAIL} already exists, left untouched.`);
  }

  if (!existingEmails.has(seedEnv.SEED_ADMIN_EMAIL)) {
    await db.insert(users).values({
      name: "Admin",
      email: seedEnv.SEED_ADMIN_EMAIL,
      passwordHash: await hashPassword(seedEnv.SEED_ADMIN_PASSWORD),
      roleId: adminRoleId,
    });
    console.log(`Created admin user ${seedEnv.SEED_ADMIN_EMAIL}.`);
  } else {
    console.log(`Admin user ${seedEnv.SEED_ADMIN_EMAIL} already exists, left untouched.`);
  }
}

async function seedShippingZones() {
  const zones = [
    {
      name: "Karachi",
      mode: "flat" as const,
      flatRate: "200.00",
      codEnabled: true,
      isFallback: false,
      sortOrder: 0,
      areas: [{ countryCode: "PK", city: "karachi" }],
    },
    {
      name: "Pakistan",
      mode: "flat" as const,
      flatRate: "300.00",
      codEnabled: true,
      isFallback: false,
      sortOrder: 1,
      areas: [{ countryCode: "PK", city: null }],
    },
    {
      name: "International",
      mode: "flat" as const,
      flatRate: "3000.00",
      codEnabled: false,
      isFallback: true,
      sortOrder: 2,
      areas: [] as { countryCode: string; city: string | null }[],
    },
  ];

  for (const zone of zones) {
    const [existingZone] = await db.select().from(shippingZones).where(eq(shippingZones.name, zone.name));
    const zoneId =
      existingZone?.id ??
      (
        await db.insert(shippingZones).values({
          name: zone.name,
          mode: zone.mode,
          flatRate: zone.flatRate,
          codEnabled: zone.codEnabled,
          isFallback: zone.isFallback,
          sortOrder: zone.sortOrder,
        })
      )[0].insertId;

    for (const area of zone.areas) {
      const existing = await db
        .select()
        .from(shippingZoneAreas)
        .where(sql`${shippingZoneAreas.countryCode} = ${area.countryCode} AND ${shippingZoneAreas.city} <=> ${area.city}`);
      if (existing.length === 0) {
        await db.insert(shippingZoneAreas).values({ zoneId, countryCode: area.countryCode, city: area.city });
      }
    }
  }
  console.log("Upserted shipping zones: Karachi, Pakistan, International.");
}

async function seedCatalog() {
  const categorySeeds = [
    { name: "Tableware", slug: "tableware", sortOrder: 0 },
    { name: "Tea Sets", slug: "tea-sets", sortOrder: 1 },
    { name: "Trays", slug: "trays", sortOrder: 2 },
    { name: "Decor", slug: "decor", sortOrder: 3 },
  ];

  for (const category of categorySeeds) {
    await db
      .insert(categories)
      .values({ name: category.name, slug: category.slug, sortOrder: category.sortOrder })
      .onDuplicateKeyUpdate({ set: { name: category.name, sortOrder: category.sortOrder } });
  }

  const categoryRows = await db.select().from(categories);
  const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

  const productSeeds = [
    { categorySlug: "tableware", name: "Porcelain Dinner Plate Set", slug: "porcelain-dinner-plate-set", sku: "RSH-TW-001", price: "4500.00", isFeatured: true },
    { categorySlug: "tableware", name: "Stoneware Bowl Set", slug: "stoneware-bowl-set", sku: "RSH-TW-002", price: "3200.00", isFeatured: false },
    { categorySlug: "tea-sets", name: "Floral Ceramic Tea Set", slug: "floral-ceramic-tea-set", sku: "RSH-TS-001", price: "6800.00", isFeatured: true },
    { categorySlug: "tea-sets", name: "Classic White Tea Set", slug: "classic-white-tea-set", sku: "RSH-TS-002", price: "5200.00", isFeatured: false },
    { categorySlug: "trays", name: "Wooden Serving Tray", slug: "wooden-serving-tray", sku: "RSH-TR-001", price: "2400.00", isFeatured: true },
    { categorySlug: "trays", name: "Marble Finish Tray", slug: "marble-finish-tray", sku: "RSH-TR-002", price: "3100.00", isFeatured: false },
    { categorySlug: "decor", name: "Ceramic Vase", slug: "ceramic-vase", sku: "RSH-DC-001", price: "2900.00", isFeatured: false },
    { categorySlug: "decor", name: "Wall Art Panel", slug: "wall-art-panel", sku: "RSH-DC-002", price: "5600.00", isFeatured: false },
  ];

  for (const product of productSeeds) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) continue;
    await db
      .insert(products)
      .values({
        categoryId,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        price: product.price,
        stock: 20,
        isFeatured: product.isFeatured,
        status: "active",
      })
      .onDuplicateKeyUpdate({
        set: { name: product.name, price: product.price, isFeatured: product.isFeatured },
      });
  }
  console.log(`Upserted ${categorySeeds.length} categories and ${productSeeds.length} sample products.`);
}

async function main() {
  await seedPermissions();
  await seedRoles();
  const { developerRole, adminRole } = await seedRolePermissions();
  await seedUsers(developerRole.id, adminRole.id);
  await seedShippingZones();
  await seedCatalog();
  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
