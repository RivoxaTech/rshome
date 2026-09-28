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
import { categories, productVariants, products } from "../src/server/db/schema/catalog";
import {
  permissions as permissionsTable,
  rolePermissions,
  roles,
  users,
} from "../src/server/db/schema/access-control";
import { settings } from "../src/server/db/schema/settings";
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
  // All zones are `quote`: the client quotes delivery on WhatsApp per parcel (client decision S2b #2).
  const zones = [
    {
      name: "Karachi",
      mode: "quote" as const,
      flatRate: "0.00",
      codEnabled: true,
      isFallback: false,
      sortOrder: 0,
      areas: [{ countryCode: "PK", city: "karachi" }],
    },
    {
      name: "Pakistan",
      mode: "quote" as const,
      flatRate: "0.00",
      codEnabled: true,
      isFallback: false,
      sortOrder: 1,
      areas: [{ countryCode: "PK", city: null }],
    },
    {
      name: "International",
      mode: "quote" as const,
      flatRate: "0.00",
      codEnabled: false,
      isFallback: true,
      sortOrder: 2,
      areas: [] as { countryCode: string; city: string | null }[],
    },
  ];

  // This seed is for setup and dev only: it force-sets mode/flat_rate/free_over_amount/cod_enabled on
  // every run, even for rows already edited elsewhere. Once the S14 zone editor exists, stop overwriting
  // these fields here (upsert name/areas only) so a Developer's panel changes survive a reseed.
  for (const zone of zones) {
    const [existingZone] = await db.select().from(shippingZones).where(eq(shippingZones.name, zone.name));
    let zoneId: number;
    if (existingZone) {
      zoneId = existingZone.id;
      await db
        .update(shippingZones)
        .set({
          mode: zone.mode,
          flatRate: zone.flatRate,
          freeOverAmount: null,
          codEnabled: zone.codEnabled,
        })
        .where(eq(shippingZones.id, zoneId));
    } else {
      const [result] = await db.insert(shippingZones).values({
        name: zone.name,
        mode: zone.mode,
        flatRate: zone.flatRate,
        codEnabled: zone.codEnabled,
        isFallback: zone.isFallback,
        sortOrder: zone.sortOrder,
      });
      zoneId = result.insertId;
    }

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

type VariantSeed = {
  sku: string;
  label: string;
  attributes: Record<string, string>;
  stock: number;
  priceOverride?: string;
};

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

  // A "Default" variant is a simple product's single, unavoidable variant row (client decision S2b #6).
  const productSeeds: {
    categorySlug: string;
    name: string;
    slug: string;
    price: string;
    isFeatured: boolean;
    variants: VariantSeed[];
  }[] = [
    {
      categorySlug: "tableware",
      name: "Porcelain Dinner Plate Set",
      slug: "porcelain-dinner-plate-set",
      price: "4500.00",
      isFeatured: true,
      variants: [
        { sku: "RSH-TW-001-WHT", label: "White", attributes: { Colour: "White" }, stock: 20 },
        { sku: "RSH-TW-001-IVR", label: "Ivory", attributes: { Colour: "Ivory" }, stock: 15, priceOverride: "4800.00" },
      ],
    },
    {
      categorySlug: "tableware",
      name: "Stoneware Bowl Set",
      slug: "stoneware-bowl-set",
      price: "3200.00",
      isFeatured: false,
      variants: [{ sku: "RSH-TW-002", label: "Default", attributes: {}, stock: 20 }],
    },
    {
      categorySlug: "tea-sets",
      name: "Floral Ceramic Tea Set",
      slug: "floral-ceramic-tea-set",
      price: "6800.00",
      isFeatured: true,
      variants: [
        { sku: "RSH-TS-001-6PC", label: "6-Piece", attributes: { Size: "6-Piece" }, stock: 18 },
        { sku: "RSH-TS-001-12PC", label: "12-Piece", attributes: { Size: "12-Piece" }, stock: 10, priceOverride: "11500.00" },
      ],
    },
    {
      categorySlug: "tea-sets",
      name: "Classic White Tea Set",
      slug: "classic-white-tea-set",
      price: "5200.00",
      isFeatured: false,
      variants: [{ sku: "RSH-TS-002", label: "Default", attributes: {}, stock: 20 }],
    },
    {
      categorySlug: "trays",
      name: "Wooden Serving Tray",
      slug: "wooden-serving-tray",
      price: "2400.00",
      isFeatured: true,
      variants: [
        { sku: "RSH-TR-001-SM", label: "Small", attributes: { Size: "Small" }, stock: 25 },
        { sku: "RSH-TR-001-MD", label: "Medium", attributes: { Size: "Medium" }, stock: 20, priceOverride: "2800.00" },
        { sku: "RSH-TR-001-LG", label: "Large", attributes: { Size: "Large" }, stock: 12, priceOverride: "3300.00" },
      ],
    },
    {
      categorySlug: "trays",
      name: "Marble Finish Tray",
      slug: "marble-finish-tray",
      price: "3100.00",
      isFeatured: false,
      variants: [{ sku: "RSH-TR-002", label: "Default", attributes: {}, stock: 20 }],
    },
    {
      categorySlug: "decor",
      name: "Ceramic Vase",
      slug: "ceramic-vase",
      price: "2900.00",
      isFeatured: false,
      variants: [
        { sku: "RSH-DC-001-WHT", label: "White", attributes: { Colour: "White" }, stock: 20 },
        { sku: "RSH-DC-001-BLK", label: "Black", attributes: { Colour: "Black" }, stock: 20 },
      ],
    },
    {
      categorySlug: "decor",
      name: "Wall Art Panel",
      slug: "wall-art-panel",
      price: "5600.00",
      isFeatured: false,
      variants: [{ sku: "RSH-DC-002", label: "Default", attributes: {}, stock: 20 }],
    },
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
        price: product.price,
        isFeatured: product.isFeatured,
        status: "active",
      })
      .onDuplicateKeyUpdate({
        set: { name: product.name, price: product.price, isFeatured: product.isFeatured },
      });
  }

  const productRows = await db.select().from(products);
  const productIdBySlug = new Map(productRows.map((p) => [p.slug, p.id]));

  let variantCount = 0;
  for (const product of productSeeds) {
    const productId = productIdBySlug.get(product.slug);
    if (!productId) continue;
    for (const [index, variant] of product.variants.entries()) {
      await db
        .insert(productVariants)
        .values({
          productId,
          sku: variant.sku,
          label: variant.label,
          attributes: JSON.stringify(variant.attributes),
          priceOverride: variant.priceOverride,
          stock: variant.stock,
          sortOrder: index,
        })
        .onDuplicateKeyUpdate({
          set: {
            label: variant.label,
            attributes: JSON.stringify(variant.attributes),
            priceOverride: variant.priceOverride,
            stock: variant.stock,
          },
        });
      variantCount += 1;
    }
  }
  console.log(
    `Upserted ${categorySeeds.length} categories, ${productSeeds.length} sample products and ${variantCount} variants.`,
  );
}

// Contact and social values from the client (S2b #8); logo text "RS Home" is a build-time
// default in config/site.config.ts (added in S3), not a runtime setting.
async function seedSettings() {
  const values: Record<string, unknown> = {
    contact: {
      phone: "03218581969",
      whatsapp: "923218581969",
      address: "DHA Phase 6, Karachi, Pakistan",
    },
    social_links: {
      facebook: "https://www.facebook.com/share/1BzHaKucmx/",
      instagram: "https://www.instagram.com/reema_shamsi",
      instagramHandle: "@reema_shamsi",
    },
  };

  for (const [key, value] of Object.entries(values)) {
    await db
      .insert(settings)
      .values({ key, value: JSON.stringify(value) })
      .onDuplicateKeyUpdate({ set: { value: JSON.stringify(value) } });
  }
  console.log(`Upserted ${Object.keys(values).length} settings keys: ${Object.keys(values).join(", ")}.`);
}

async function main() {
  await seedPermissions();
  await seedRoles();
  const { developerRole, adminRole } = await seedRolePermissions();
  await seedUsers(developerRole.id, adminRole.id);
  await seedShippingZones();
  await seedCatalog();
  await seedSettings();
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
