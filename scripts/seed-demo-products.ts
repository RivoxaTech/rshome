/**
 * Dev-only demo products for manual QA of the panel's products CRUD (S10 phase 2). Two modes:
 *
 *   npm run db:seed:products            places 6 tagged products (a mix of statuses, categories
 *                                        and one featured) through the real `createProduct`
 *                                        service, so the transaction/audit path is exercised;
 *                                        three of them then get 2-4 colour/size variants through
 *                                        the real `createVariant` service (phase 3a), one with a
 *                                        price override, one sold out, one inactive; three of them
 *                                        (2-4 each) also get real gallery images through the real
 *                                        `addProductImage` service (phase 3b) — tiny generated
 *                                        sharp images, run through the real WebP pipeline, not a
 *                                        copied placeholder file.
 *                                        `-- --many` adds 40 more (varied names) for pagination
 *                                        testing.
 *   npm run db:reset:products            removes exactly the tagged products (their variants,
 *                                        image rows, and the image files on disk) — never the 8
 *                                        untagged `scripts/seed.ts` sample products, and never a
 *                                        blanket reset.
 *
 * Refuses to run against anything but the "rs_home" database (never "rs_home_test" or a host DB).
 */
import "../src/server/load-env";
import { eq, inArray, like } from "drizzle-orm";
import sharp from "sharp";
import { addProductImage } from "../src/features/catalog/images-staff-service";
import { createProduct, type StaffActionResult } from "../src/features/catalog/products-staff-service";
import { createVariant } from "../src/features/catalog/variants-staff-service";
import { db, pool } from "../src/server/db/client";
import { roles, users } from "../src/server/db/schema/access-control";
import { categories, productImages, productVariants, products } from "../src/server/db/schema/catalog";
import { deleteMediaImage, processMediaImage } from "../src/server/storage/images";
import { env } from "../src/server/env";

/** Tags every row this script creates, so the targeted reset never touches other seed data. */
const TAG = "Demo Product — ";

function assertDevDatabase(): void {
  const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
  if (databaseName !== "rs_home") {
    throw new Error(`Refusing to run against database "${databaseName}" — this script only runs against "rs_home", never a *_test or host database.`);
  }
}

// ── Reset ───────────────────────────────────────────────────────────────────────────────────

async function resetProducts(): Promise<void> {
  const tagged = await db.select({ id: products.id }).from(products).where(like(products.name, `${TAG}%`));
  const ids = tagged.map((row) => row.id);
  if (ids.length === 0) {
    console.log("Reset complete: no tagged demo products found.");
    return;
  }

  const images = await db.select({ path: productImages.path }).from(productImages).where(inArray(productImages.productId, ids));
  await db.delete(productImages).where(inArray(productImages.productId, ids));
  await db.delete(productVariants).where(inArray(productVariants.productId, ids));
  await db.delete(products).where(inArray(products.id, ids));
  for (const image of images) await deleteMediaImage(image.path);

  console.log(`Reset complete: ${ids.length} demo products deleted, ${images.length} image file(s) removed.`);
}

// ── Seed ────────────────────────────────────────────────────────────────────────────────────

async function getDeveloperActorId(): Promise<number> {
  const [developer] = await db.select({ id: users.id }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(roles.key, "developer")).limit(1);
  if (!developer) throw new Error(`No developer user found. Run "npm run db:seed" first.`);
  return developer.id;
}

async function getCategoryIdBySlug(slug: string): Promise<number> {
  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  if (!category) throw new Error(`Category "${slug}" not found. Run "npm run db:seed" first.`);
  return category.id;
}

type Placement = "top" | "end" | "position";

type SeedProduct = {
  name: string;
  slug: string;
  categorySlug: string;
  price: string;
  status: "draft" | "active" | "archived";
  isFeatured?: boolean;
  shortDescription?: string;
  /** Manual ordering (S10 phase 2b): interleaves demo products among the sample ones instead of
   *  always appending at the end, so the arrange page has real reordering to do. Default "end". */
  shopPlacement?: Placement;
  shopPosition?: number;
  featuredPlacement?: Placement;
  featuredPosition?: number;
  /** Extra variants added after the product's "Default" one (S10 phase 3a). */
  variants?: SeedVariant[];
  /** Extra gallery images (2-4) added through the real `addProductImage` service (S10 phase 3b). */
  images?: number;
};

/** A demo variant, posted exactly as the Add-variant dialog would (indexed attribute fields). */
type SeedVariant = { sku: string; attributes: Record<string, string>; stock: number; priceOverride?: string; isActive?: boolean };

// A small fixed palette so a visual scan of the gallery shows distinct swatches rather than one
// flat colour repeated — real pixels through the real sharp pipeline (S10 phase 3b), not a copied
// placeholder file, so each image gets its own random upload-style path.
const DEMO_IMAGE_COLOURS: { r: number; g: number; b: number }[] = [
  { r: 196, g: 164, b: 132 },
  { r: 120, g: 150, b: 140 },
  { r: 180, g: 120, b: 110 },
  { r: 150, g: 140, b: 190 },
];

async function placeImages(productId: number, count: number, actorId: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const colour = DEMO_IMAGE_COLOURS[i % DEMO_IMAGE_COLOURS.length];
    const buffer = await sharp({ create: { width: 640, height: 640, channels: 3, background: colour } })
      .jpeg({ quality: 70 })
      .toBuffer();
    const image = await processMediaImage(buffer, "products");
    const result = await addProductImage(productId, image, { id: actorId });
    if (!result.ok) throw new Error(`addProductImage failed for product ${productId}: ${result.error}`);
  }
}

async function placeVariants(productId: number, variants: SeedVariant[], actorId: number): Promise<void> {
  for (const variant of variants) {
    const attributeFields = Object.fromEntries(Object.entries(variant.attributes).flatMap(([key, value], index) => [[`attributeKey${index}`, key], [`attributeValue${index}`, value]]));
    const result = await createVariant(
      productId,
      { label: "", sku: variant.sku, priceOverride: variant.priceOverride ?? "", stock: String(variant.stock), weightGrams: "", isActive: variant.isActive === false ? "false" : "true", ...attributeFields },
      { id: actorId },
    );
    if (!result.ok) throw new Error(`createVariant failed for "${variant.sku}": ${result.error}`);
  }
}

async function placeProduct(product: SeedProduct, sku: string, stock: number, actorId: number): Promise<number> {
  const categoryId = await getCategoryIdBySlug(product.categorySlug);
  const result: StaffActionResult = await createProduct(
    {
      name: `${TAG}${product.name}`,
      slug: product.slug,
      categoryId: String(categoryId),
      shortDescription: product.shortDescription ?? "",
      description: "",
      price: product.price,
      weightGrams: "",
      status: product.status,
      isFeatured: product.isFeatured ? "true" : "false",
      imagePath: "",
      imagePathWidth: "",
      imagePathHeight: "",
      sku,
      stock: String(stock),
      shopPlacement: product.shopPlacement ?? "end",
      ...(product.shopPosition !== undefined ? { shopPosition: String(product.shopPosition) } : {}),
      featuredPlacement: product.featuredPlacement ?? "end",
      ...(product.featuredPosition !== undefined ? { featuredPosition: String(product.featuredPosition) } : {}),
    },
    { id: actorId },
  );
  if (!result.ok) throw new Error(`createProduct failed for "${product.name}": ${result.error}`);
  if (product.variants) await placeVariants(result.id!, product.variants, actorId);
  if (product.images) await placeImages(result.id!, product.images, actorId);
  return result.id!;
}

const BASE_PRODUCTS: SeedProduct[] = [
  {
    name: "Hand-Painted Serving Bowl",
    slug: "demo-hand-painted-serving-bowl",
    categorySlug: "tableware",
    price: "2200.00",
    status: "active",
    isFeatured: true,
    shopPlacement: "top",
    images: 3,
    // Colour + Size pairs: a price override, a sold-out one and an inactive one, for the variants card and the storefront picker.
    variants: [
      { sku: "DEMO-BOWL-BLUE-S", attributes: { Colour: "Blue", Size: "Small" }, stock: 8 },
      { sku: "DEMO-BOWL-BLUE-L", attributes: { Colour: "Blue", Size: "Large" }, stock: 3, priceOverride: "2600.00" },
      { sku: "DEMO-BOWL-GREEN-S", attributes: { Colour: "Green", Size: "Small" }, stock: 0 },
      { sku: "DEMO-BOWL-GREEN-L", attributes: { Colour: "Green", Size: "Large" }, stock: 5, priceOverride: "2600.00", isActive: false },
    ],
  },
  {
    name: "Brass Candle Holder",
    slug: "demo-brass-candle-holder",
    categorySlug: "decor",
    price: "1800.00",
    status: "active",
    isFeatured: true,
    featuredPlacement: "top",
    images: 2,
    variants: [
      { sku: "DEMO-CANDLE-ANTIQUE", attributes: { Finish: "Antique" }, stock: 6 },
      { sku: "DEMO-CANDLE-POLISHED", attributes: { Finish: "Polished" }, stock: 2, priceOverride: "1950.00" },
    ],
  },
  {
    name: "Linen Table Runner",
    slug: "demo-linen-table-runner",
    categorySlug: "tableware",
    price: "1500.00",
    status: "active",
    shopPlacement: "position",
    shopPosition: 3,
    images: 4,
    variants: [
      { sku: "DEMO-RUNNER-NATURAL", attributes: { Colour: "Natural" }, stock: 12 },
      { sku: "DEMO-RUNNER-CHARCOAL", attributes: { Colour: "Charcoal" }, stock: 4 },
      { sku: "DEMO-RUNNER-SAGE", attributes: { Colour: "Sage" }, stock: 0 },
    ],
  },
  { name: "Copper Tea Set", slug: "demo-copper-tea-set", categorySlug: "tea-sets", price: "4500.00", status: "draft" },
  { name: "Rattan Serving Tray", slug: "demo-rattan-serving-tray", categorySlug: "trays", price: "2600.00", status: "archived" },
  {
    name: "Engraved Wooden Tray",
    slug: "demo-engraved-wooden-tray",
    categorySlug: "trays",
    price: "2100.00",
    status: "active",
    isFeatured: true,
    featuredPlacement: "position",
    featuredPosition: 2,
  },
];

const MANY_CATEGORY_SLUGS = ["tableware", "tea-sets", "trays", "decor"] as const;
const MANY_ADJECTIVES = ["Rustic", "Minimalist", "Hand-Glazed", "Embossed", "Woven", "Matte", "Polished", "Textured"] as const;
const MANY_NOUNS = ["Bowl", "Plate", "Vase", "Mug Set", "Platter", "Jar", "Dish", "Carafe"] as const;

function manyProduct(index: number): SeedProduct {
  const adjective = MANY_ADJECTIVES[index % MANY_ADJECTIVES.length];
  const noun = MANY_NOUNS[(index * 3 + 1) % MANY_NOUNS.length];
  const categorySlug = MANY_CATEGORY_SLUGS[index % MANY_CATEGORY_SLUGS.length];
  const name = `${adjective} ${noun} ${index + 1}`;
  // A mix of top/position/end so the 40 extra rows interleave with everything already seeded,
  // rather than only ever appending — real reordering for the arrange page's pagination QA.
  const shopPlacement: Placement = index % 7 === 0 ? "top" : index % 5 === 0 ? "position" : "end";
  return {
    name,
    slug: `demo-many-${index + 1}`,
    categorySlug,
    price: `${1200 + (index % 20) * 150}.00`,
    status: index % 11 === 0 ? "draft" : index % 13 === 0 ? "archived" : "active",
    shopPlacement,
    shopPosition: shopPlacement === "position" ? 5 + (index % 10) : undefined,
  };
}

async function seedProducts(many: boolean): Promise<number> {
  const actorId = await getDeveloperActorId();
  let count = 0;

  for (const product of BASE_PRODUCTS) {
    await placeProduct(product, `DEMO-${count + 1}`, 10 + count, actorId);
    count += 1;
  }

  if (many) {
    for (let index = 0; index < 40; index += 1) {
      await placeProduct(manyProduct(index), `DEMO-MANY-${index + 1}`, 5 + (index % 15), actorId);
      count += 1;
    }
  }

  return count;
}

// ── Entry point ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertDevDatabase();
  const mode = process.argv[2];
  const many = process.argv.includes("--many");

  if (mode === "reset") {
    await resetProducts();
  } else if (mode === "seed") {
    const count = await seedProducts(many);
    console.log(`Placed ${count} demo products.`);
  } else {
    throw new Error('Usage: tsx scripts/seed-demo-products.ts <reset|seed> [--many]');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
