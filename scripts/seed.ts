import "../src/server/load-env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { siteConfig } from "../src/config/site.config";
import {
  ADMIN_DEFAULT_PERMISSIONS,
  DEVELOPER_DEFAULT_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  PERMISSIONS,
  type PermissionKey,
} from "../src/features/auth/permissions";
import { syncRolePermissions } from "../src/features/auth/repo";
import { hashPassword } from "../src/server/auth/password";
import { db, pool } from "../src/server/db/client";
import { categories, productImages, productVariants, products } from "../src/server/db/schema/catalog";
import { permissions as permissionsTable, roles, users } from "../src/server/db/schema/access-control";
import { coupons, discounts, discountTargets } from "../src/server/db/schema/promotions";
import { settings } from "../src/server/db/schema/settings";
import { shippingZoneAreas, shippingZones } from "../src/server/db/schema/shipping";
import { processMediaImage, type ProcessedMediaImage } from "../src/server/storage/images";

const seedUsersEnvSchema = z.object({
  SEED_DEVELOPER_EMAIL: z.email(),
  SEED_DEVELOPER_PASSWORD: z.string().min(6),
  SEED_ADMIN_EMAIL: z.email(),
  SEED_ADMIN_PASSWORD: z.string().min(6),
});

// The 4 placeholder photos from design-reference/src/assets, run through the real S4 media
// pipeline (DATABASE.md "Seed data"). Fixed basenames (instead of the random ones real uploads
// get, CLAUDE.md #8) make this idempotent: processMediaImage skips re-encoding once the WebP
// files already exist under UPLOAD_DIR/media/seed.
const SEED_SOURCE_IMAGES = {
  hero: "hero.jpg",
  tableware: "tableware.jpg",
  teaset: "teaset.jpg",
  tray: "tray.jpg",
} as const;
type SeedImageKey = keyof typeof SEED_SOURCE_IMAGES;

async function seedMediaImages(): Promise<Record<SeedImageKey, ProcessedMediaImage>> {
  const assetsDir = path.join(process.cwd(), "design-reference", "src", "assets");
  const entries = await Promise.all(
    (Object.entries(SEED_SOURCE_IMAGES) as [SeedImageKey, string][]).map(async ([key, filename]) => {
      const buffer = await readFile(path.join(assetsDir, filename));
      const image = await processMediaImage(buffer, "seed", key);
      return [key, image] as const;
    }),
  );
  console.log(`Processed ${entries.length} seed images into UPLOAD_DIR/media/seed.`);
  return Object.fromEntries(entries) as Record<SeedImageKey, ProcessedMediaImage>;
}

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

// Both are system roles (DATABASE.md): neither can be edited or deleted in the panel, and their
// permission sets are owned by the code above, not by whatever a past run granted.
async function seedRoles() {
  await db
    .insert(roles)
    .values({ key: "developer", name: "Developer", isSystem: true })
    .onDuplicateKeyUpdate({ set: { name: "Developer", isSystem: true } });
  await db
    .insert(roles)
    .values({ key: "admin", name: "Admin", isSystem: true })
    .onDuplicateKeyUpdate({ set: { name: "Admin", isSystem: true } });
  console.log("Upserted roles: developer, admin.");
}

/**
 * Syncs both system roles to their default sets by granting AND revoking (ARCHITECTURE.md §4.5,
 * BUILD_PLAN.md C24): a permission no longer listed for a role is deleted from `role_permissions`,
 * not just left alone, so reversing a role's access takes effect on the next seed run.
 */
async function seedRolePermissions() {
  const roleRows = await db.select().from(roles);
  const developerRole = roleRows.find((r) => r.key === "developer")!;
  const adminRole = roleRows.find((r) => r.key === "admin")!;

  const developerSync = await syncRolePermissions(developerRole.id, DEVELOPER_DEFAULT_PERMISSIONS);
  const adminSync = await syncRolePermissions(adminRole.id, ADMIN_DEFAULT_PERMISSIONS);
  console.log(`Developer role: granted ${developerSync.granted}, revoked ${developerSync.revoked}.`);
  console.log(`Admin role: granted ${adminSync.granted}, revoked ${adminSync.revoked}.`);
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

  // Since S14 the panel's zone editor (`/panel/shipping`) owns these rows: a zone that already
  // exists is left exactly as staff last saved it (mode, rate, COD, active, areas), and only a
  // missing zone or a missing seed area is created. Before S14 this force-reset every field on
  // each run, which would now undo a Developer's panel changes.
  for (const zone of zones) {
    const [existingZone] = await db.select().from(shippingZones).where(eq(shippingZones.name, zone.name));
    let zoneId: number;
    if (existingZone) {
      zoneId = existingZone.id;
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
      console.log(`Created shipping zone ${zone.name}.`);
    }

    // An area belongs to exactly one zone (unique index); one already owned — by this zone or,
    // after a panel edit, another — is never moved.
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
  console.log("Shipping zones present: Karachi, Pakistan, International (existing rows left as saved in the panel).");
}

export type VariantSeed = {
  sku: string;
  label: string;
  attributes: Record<string, string>;
  stock: number;
  priceOverride?: string;
};

export type ProductSeed = {
  categorySlug: string;
  name: string;
  slug: string;
  shortDescription: string;
  price: string;
  isFeatured: boolean;
  variants: VariantSeed[];
};

// A "Default" variant is a simple product's single, unavoidable variant row (client decision S2b #6).
// Exported so scripts/seed-demo-orders.ts can read real SKUs and stock levels rather than inventing
// numbers of its own when it restores variant stock to the seed value.
export const PRODUCT_SEEDS: ProductSeed[] = [
  {
    categorySlug: "tableware",
    name: "Porcelain Dinner Plate Set",
    slug: "porcelain-dinner-plate-set",
    shortDescription: "Premium dining collection",
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
    shortDescription: "Everyday stoneware bowls",
    price: "3200.00",
    isFeatured: false,
    variants: [{ sku: "RSH-TW-002", label: "Default", attributes: {}, stock: 20 }],
  },
  {
    categorySlug: "tea-sets",
    name: "Floral Ceramic Tea Set",
    slug: "floral-ceramic-tea-set",
    shortDescription: "Elegant ceramic tea set",
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
    shortDescription: "Timeless white porcelain tea set",
    price: "5200.00",
    isFeatured: false,
    variants: [{ sku: "RSH-TS-002", label: "Default", attributes: {}, stock: 20 }],
  },
  {
    categorySlug: "trays",
    name: "Wooden Serving Tray",
    slug: "wooden-serving-tray",
    shortDescription: "Minimal luxury serving tray",
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
    shortDescription: "Polished marble-finish tray",
    price: "3100.00",
    isFeatured: false,
    variants: [{ sku: "RSH-TR-002", label: "Default", attributes: {}, stock: 20 }],
  },
  {
    categorySlug: "decor",
    name: "Ceramic Vase",
    slug: "ceramic-vase",
    shortDescription: "Minimal decorative accent",
    price: "2900.00",
    // One featured product per category, matching the demo's "Edit" section (one item per collection).
    isFeatured: true,
    variants: [
      { sku: "RSH-DC-001-WHT", label: "White", attributes: { Colour: "White" }, stock: 20 },
      { sku: "RSH-DC-001-BLK", label: "Black", attributes: { Colour: "Black" }, stock: 20 },
    ],
  },
  {
    categorySlug: "decor",
    name: "Wall Art Panel",
    slug: "wall-art-panel",
    shortDescription: "Statement wall art panel",
    price: "5600.00",
    isFeatured: false,
    variants: [{ sku: "RSH-DC-002", label: "Default", attributes: {}, stock: 20 }],
  },
];

async function seedCatalog(media: Record<SeedImageKey, ProcessedMediaImage>) {
  const categorySeeds = [
    {
      name: "Tableware",
      slug: "tableware",
      sortOrder: 0,
      description: "Elegant pieces for everyday dining and entertaining.",
      imageKey: "tableware" as SeedImageKey,
    },
    {
      name: "Tea Sets",
      slug: "tea-sets",
      sortOrder: 1,
      description: "Refined tea moments, beautifully presented.",
      imageKey: "teaset" as SeedImageKey,
    },
    {
      name: "Trays",
      slug: "trays",
      sortOrder: 2,
      description: "Functional pieces designed to elevate presentation.",
      imageKey: "tray" as SeedImageKey,
    },
    {
      // Reuses the hero photo, same as the demo's own Decor section (design-reference/src/routes/index.tsx).
      name: "Decor",
      slug: "decor",
      sortOrder: 3,
      description: "Small details that transform a space.",
      imageKey: "hero" as SeedImageKey,
    },
  ];
  const categoryImageKeyBySlug = new Map(categorySeeds.map((c) => [c.slug, c.imageKey]));

  for (const category of categorySeeds) {
    const image = media[category.imageKey];
    await db
      .insert(categories)
      .values({
        name: category.name,
        slug: category.slug,
        description: category.description,
        imagePath: image.path,
        sortOrder: category.sortOrder,
      })
      .onDuplicateKeyUpdate({
        set: { name: category.name, description: category.description, imagePath: image.path, sortOrder: category.sortOrder },
      });
  }

  const categoryRows = await db.select().from(categories);
  const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));
  const productSeeds = PRODUCT_SEEDS;

  // Manual ordering (S10 phase 2b): sort_order follows this array's own order; featured_sort_order
  // follows the same order among just the featured ones (non-featured rows' value is unused).
  let featuredIndex = 0;
  for (const [sortOrder, product] of productSeeds.entries()) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) continue;
    const featuredSortOrder = product.isFeatured ? featuredIndex++ : 0;
    await db
      .insert(products)
      .values({
        categoryId,
        name: product.name,
        slug: product.slug,
        shortDescription: product.shortDescription,
        price: product.price,
        isFeatured: product.isFeatured,
        status: "active",
        sortOrder,
        featuredSortOrder,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: product.name,
          shortDescription: product.shortDescription,
          price: product.price,
          isFeatured: product.isFeatured,
          sortOrder,
          featuredSortOrder,
        },
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

  // Every product gets a 3-image gallery: its category's placeholder first (sort_order 0 = primary
  // per DATABASE.md), then the next two placeholders, so the product-page gallery has something to
  // switch between. No unique constraint covers (product_id, sort_order), so this checks first
  // rather than relying on onDuplicateKeyUpdate.
  const allImageKeys = Object.keys(SEED_SOURCE_IMAGES) as SeedImageKey[];
  let imageCount = 0;
  for (const product of productSeeds) {
    const productId = productIdBySlug.get(product.slug);
    const primaryKey = categoryImageKeyBySlug.get(product.categorySlug);
    if (!productId || !primaryKey) continue;
    const galleryKeys = [primaryKey, ...allImageKeys.filter((key) => key !== primaryKey).slice(0, 2)];

    for (const [sortOrder, imageKey] of galleryKeys.entries()) {
      const image = media[imageKey];
      const [existingImage] = await db
        .select()
        .from(productImages)
        .where(and(eq(productImages.productId, productId), eq(productImages.sortOrder, sortOrder)));

      if (existingImage) {
        await db
          .update(productImages)
          .set({ path: image.path, width: image.width, height: image.height, alt: product.name })
          .where(eq(productImages.id, existingImage.id));
      } else {
        await db.insert(productImages).values({
          productId,
          path: image.path,
          width: image.width,
          height: image.height,
          alt: product.name,
          sortOrder,
        });
      }
      imageCount += 1;
    }
  }

  console.log(
    `Upserted ${categorySeeds.length} categories, ${productSeeds.length} sample products, ${variantCount} variants and ${imageCount} product images.`,
  );
}

// SAMPLE DATA for development (S5): shows the discount badge and struck price on every Trays
// variant. Created once and never overwritten, so switching it off or editing its dates in the DB
// survives a reseed. Deactivate or delete it before launch.
const SAMPLE_DISCOUNT_NAME = "[Sample] 10% off Trays";

async function seedSampleDiscount() {
  const [existing] = await db.select().from(discounts).where(eq(discounts.name, SAMPLE_DISCOUNT_NAME));
  if (existing) {
    console.log(`Sample discount "${SAMPLE_DISCOUNT_NAME}" already exists, left untouched.`);
    return;
  }

  const [trays] = await db.select().from(categories).where(eq(categories.slug, "trays"));
  if (!trays) return;

  const [result] = await db.insert(discounts).values({
    name: SAMPLE_DISCOUNT_NAME,
    type: "percent",
    value: "10.00",
    targetType: "category",
    isActive: true,
  });
  await db.insert(discountTargets).values({ discountId: result.insertId, targetId: trays.id });
  console.log(`Created sample discount "${SAMPLE_DISCOUNT_NAME}".`);
}

// SAMPLE DATA for development (S6): a coupon to exercise the cart's coupon field. 10% off orders
// of PKR 3,000 or more, no dates, no limits. Created once and never overwritten, like the sample
// discount above, so edits to it survive a reseed. Deactivate or delete it before launch.
const SAMPLE_COUPON_CODE = "WELCOME10";

async function seedSampleCoupon() {
  const [existing] = await db.select().from(coupons).where(eq(coupons.code, SAMPLE_COUPON_CODE));
  if (existing) {
    console.log(`Sample coupon "${SAMPLE_COUPON_CODE}" already exists, left untouched.`);
    return;
  }

  await db.insert(coupons).values({
    code: SAMPLE_COUPON_CODE,
    type: "percent",
    value: "10.00",
    minOrder: "3000.00",
    isActive: true,
  });
  console.log(`Created sample coupon "${SAMPLE_COUPON_CODE}" (10% off, min order PKR 3,000).`);
}

// Every settings row is created once and never overwritten (S14): the panel's two settings pages
// are now the way to change them, and a reseed must not undo what staff saved. The values match
// config/site.config.ts (the storefront's fallback), so a fresh database renders identically to
// one with no rows at all. Contact and social values are from the client (S2b #8).
async function seedSettings() {
  await createSettingOnceIfMissing("store_identity", { storeName: siteConfig.storeName, logoText: siteConfig.logoText }, "the config store name and logo text");
  await createSettingOnceIfMissing("announcement_text", siteConfig.announcementText, "the config announcement text");
  await createSettingOnceIfMissing("contact", siteConfig.contact, "the client's phone, WhatsApp number and address");
  await createSettingOnceIfMissing("social_links", siteConfig.socialLinks, "the client's Facebook and Instagram links");
  await createSettingOnceIfMissing("bank_accounts", siteConfig.bankAccounts, "PLACEHOLDER values");
  // S21 Phase 2: empty = off (push is the primary new-order alert); filled in on /panel/settings.
  await createSettingOnceIfMissing("notify_owner_order_emails", [], "an empty recipient list");
  await createSettingOnceIfMissing("notify_owner_wholesale_emails", [], "an empty recipient list");
}

async function createSettingOnceIfMissing(key: string, value: unknown, describedAs: string) {
  const [existing] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, key));
  if (existing) {
    console.log(`Settings key ${key} already exists, left untouched.`);
  } else {
    await db.insert(settings).values({ key, value: JSON.stringify(value) });
    console.log(`Created settings key ${key} with ${describedAs}.`);
  }
}

async function main() {
  await seedPermissions();
  await seedRoles();
  const { developerRole, adminRole } = await seedRolePermissions();
  await seedUsers(developerRole.id, adminRole.id);
  await seedShippingZones();
  const media = await seedMediaImages();
  await seedCatalog(media);
  await seedSampleDiscount();
  await seedSampleCoupon();
  await seedSettings();
  console.log("Seed complete.");
}

// Only run when this file is the entry point (`tsx scripts/seed.ts`), not when
// scripts/seed-demo-orders.ts imports PRODUCT_SEEDS from it.
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
