/**
 * Dev-only demo discounts and coupons for manual QA of the panel's promotions CRUD (S12/S13).
 * Two modes:
 *
 *   npm run db:seed:discounts     places 5 tagged discounts (percent, fixed, category, product,
 *                                 store-wide-but-scheduled, expired, inactive) through the real
 *                                 `createDiscount` service and 6 "DEMO-" coupons (percent with a
 *                                 cap, fixed, used-up, expired, scheduled, inactive) through the
 *                                 real `createCoupon` service, then places 3 real COD orders with
 *                                 two of those coupons through the real cart quote + `createOrder`,
 *                                 so the usage counter and the "Used up" tab have real rows behind
 *                                 them. The store-wide discount is scheduled (not live) on purpose:
 *                                 a live one would block every coupon in the dev store.
 *   npm run db:reset:discounts    removes exactly what this script created: the tagged orders
 *                                 (their items, history and coupon usages, crediting stock back),
 *                                 the DEMO- coupons, the tagged discounts and their audit rows —
 *                                 never the untagged `[Sample] 10% off Trays` discount or the
 *                                 `WELCOME10` coupon from `scripts/seed.ts`.
 *
 * Refuses to run against anything but the "rs_home" database (never "rs_home_test" or a host DB).
 */
import "../src/server/load-env";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { quoteCart } from "../src/features/cart/service";
import { createOrder } from "../src/features/checkout/service";
import { createCoupon } from "../src/features/coupons/staff-service";
import { createDiscount } from "../src/features/discounts/staff-service";
import { utcToKarachiLocal } from "../src/lib/karachi-datetime";
import { db, pool } from "../src/server/db/client";
import { roles, users } from "../src/server/db/schema/access-control";
import { auditLogs } from "../src/server/db/schema/audit";
import { categories, productVariants, products } from "../src/server/db/schema/catalog";
import { orderItems, orderStatusHistory, orders } from "../src/server/db/schema/orders";
import { couponUsages, coupons, discountTargets, discounts } from "../src/server/db/schema/promotions";
import { env } from "../src/server/env";

/** Tags every discount name and order customer name this script creates, so the reset never touches other seed data. */
const TAG = "Discount Demo — ";
/** Every coupon code this script creates starts with this. */
const COUPON_PREFIX = "DEMO-";

const DAY_MS = 24 * 60 * 60 * 1000;

function assertDevDatabase(): void {
  const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
  if (databaseName !== "rs_home") {
    throw new Error(`Refusing to run against database "${databaseName}" — this script only runs against "rs_home", never a *_test or host database.`);
  }
}

// ── Reset ───────────────────────────────────────────────────────────────────────────────────

async function resetPromotions(): Promise<void> {
  const taggedOrders = await db.select({ id: orders.id, stockRestoredAt: orders.stockRestoredAt }).from(orders).where(like(orders.customerName, `${TAG}%`));
  const orderIds = taggedOrders.map((row) => row.id);
  let stockRestored = 0;
  if (orderIds.length > 0) {
    const openOrderIds = taggedOrders.filter((row) => !row.stockRestoredAt).map((row) => row.id);
    if (openOrderIds.length > 0) {
      const items = await db.select({ variantId: orderItems.variantId, quantity: orderItems.quantity }).from(orderItems).where(inArray(orderItems.orderId, openOrderIds));
      for (const item of items) {
        await db
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
          .where(eq(productVariants.id, item.variantId));
        stockRestored += 1;
      }
    }
    await db.delete(couponUsages).where(inArray(couponUsages.orderId, orderIds));
    await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, orderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }

  const taggedCoupons = await db.select({ id: coupons.id }).from(coupons).where(like(coupons.code, `${COUPON_PREFIX}%`));
  const couponIds = taggedCoupons.map((row) => row.id);
  if (couponIds.length > 0) {
    await db.delete(couponUsages).where(inArray(couponUsages.couponId, couponIds));
    await db.delete(coupons).where(inArray(coupons.id, couponIds));
    await db.delete(auditLogs).where(and(eq(auditLogs.entity, "coupon"), inArray(auditLogs.entityId, couponIds.map(String))));
  }

  const taggedDiscounts = await db.select({ id: discounts.id }).from(discounts).where(like(discounts.name, `${TAG}%`));
  const discountIds = taggedDiscounts.map((row) => row.id);
  if (discountIds.length > 0) {
    await db.delete(discountTargets).where(inArray(discountTargets.discountId, discountIds));
    await db.delete(discounts).where(inArray(discounts.id, discountIds));
    await db.delete(auditLogs).where(and(eq(auditLogs.entity, "discount"), inArray(auditLogs.entityId, discountIds.map(String))));
  }

  console.log("Reset complete:");
  console.log(`  demo orders deleted: ${orderIds.length} (variant stock rows credited back: ${stockRestored})`);
  console.log(`  demo coupons deleted: ${couponIds.length}`);
  console.log(`  demo discounts deleted: ${discountIds.length}`);
}

// ── Seed ────────────────────────────────────────────────────────────────────────────────────

let ipCounter = 0;
const nextIp = () => `promo-seed-${++ipCounter}`;

async function getDeveloperActorId(): Promise<number> {
  const [developer] = await db.select({ id: users.id }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(roles.key, "developer")).limit(1);
  if (!developer) throw new Error(`No developer user found. Run "npm run db:seed" first.`);
  return developer.id;
}

async function categoryIdBySlug(slug: string): Promise<number> {
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  if (!row) throw new Error(`Category "${slug}" not found. Run "npm run db:seed" first.`);
  return row.id;
}

async function productIdBySlug(slug: string): Promise<number> {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  if (!row) throw new Error(`Product "${slug}" not found. Run "npm run db:seed" first.`);
  return row.id;
}

async function variantIdBySku(sku: string): Promise<number> {
  const [row] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, sku));
  if (!row) throw new Error(`Variant "${sku}" not found. Run "npm run db:seed" first.`);
  return row.id;
}

const local = (offsetDays: number) => utcToKarachiLocal(new Date(Date.now() + offsetDays * DAY_MS));

type DiscountSeed = { name: string; type: "percent" | "fixed"; value: string; targetType: "all" | "category" | "product"; categorySlug?: string; productSlugs?: string[]; startsAt?: string; endsAt?: string; isActive?: boolean };

const DISCOUNTS: DiscountSeed[] = [
  { name: "15% off Tea Sets", type: "percent", value: "15", targetType: "category", categorySlug: "tea-sets" },
  { name: "PKR 300 off two Decor pieces", type: "fixed", value: "300", targetType: "product", productSlugs: ["ceramic-vase", "wall-art-panel"] },
  // Scheduled, not live: a live store-wide discount would block every coupon in the dev store (the exclusivity rule).
  { name: "Store-wide 5% (starts next week)", type: "percent", value: "5", targetType: "all", startsAt: local(7), endsAt: local(14) },
  { name: "Tableware clearance 20% (ended)", type: "percent", value: "20", targetType: "category", categorySlug: "tableware", startsAt: local(-30), endsAt: local(-1) },
  { name: "Decor PKR 500 off (switched off)", type: "fixed", value: "500", targetType: "category", categorySlug: "decor", isActive: false },
];

async function placeDiscount(seed: DiscountSeed, actorId: number): Promise<void> {
  const categoryId = seed.categorySlug ? String(await categoryIdBySlug(seed.categorySlug)) : "";
  const productIds = seed.productSlugs ? (await Promise.all(seed.productSlugs.map(productIdBySlug))).join(",") : "";
  // Exactly the fields `DiscountForm` posts. `allowPastDates` is the seed-only escape from the
  // no-past-dates rule, so the expired/already-started fixtures can exist at all.
  const result = await createDiscount(
    { name: `${TAG}${seed.name}`, type: seed.type, value: seed.value, targetType: seed.targetType, categoryId, productIds, startsAt: seed.startsAt ?? "", endsAt: seed.endsAt ?? "", isActive: seed.isActive === false ? "false" : "true" },
    { id: actorId },
    { allowPastDates: true },
  );
  if (!result.ok) throw new Error(`createDiscount failed for "${seed.name}": ${result.error}`);
}

type CouponSeed = { code: string; type: "percent" | "fixed"; value: string; minOrder?: string; maxDiscount?: string; usageLimit?: string; perCustomerLimit?: string; startsAt?: string; endsAt?: string; isActive?: boolean };

const COUPONS: CouponSeed[] = [
  { code: "SAVE10", type: "percent", value: "10", minOrder: "2000", maxDiscount: "500", usageLimit: "50" },
  { code: "FLAT200", type: "fixed", value: "200", minOrder: "1500", perCustomerLimit: "1" },
  { code: "ONCE", type: "percent", value: "5", usageLimit: "1" },
  { code: "EXPIRED", type: "fixed", value: "100", startsAt: local(-20), endsAt: local(-1) },
  { code: "SOON", type: "percent", value: "15", startsAt: local(3) },
  { code: "OFF", type: "percent", value: "20", isActive: false },
];

async function placeCoupon(seed: CouponSeed, actorId: number): Promise<void> {
  // Exactly the fields `CouponForm` posts.
  const result = await createCoupon(
    {
      code: `${COUPON_PREFIX}${seed.code}`,
      type: seed.type,
      value: seed.value,
      minOrder: seed.minOrder ?? "",
      maxDiscount: seed.maxDiscount ?? "",
      usageLimit: seed.usageLimit ?? "",
      perCustomerLimit: seed.perCustomerLimit ?? "",
      startsAt: seed.startsAt ?? "",
      endsAt: seed.endsAt ?? "",
      isActive: seed.isActive === false ? "false" : "true",
    },
    { id: actorId },
    { allowPastDates: true },
  );
  if (!result.ok) throw new Error(`createCoupon failed for "${seed.code}": ${result.error}`);
}

/**
 * A real COD order with a coupon, the way the browser does it: the cart quote first (which is
 * where the coupon is checked and the expected total comes from), then `createOrder`. Tableware
 * SKUs only — no live demo discount or the sample Trays discount touches them, so the coupon is
 * never blocked by the exclusivity rule.
 */
async function placeCouponOrder(seed: number, couponCode: string, sku: string, quantity: number): Promise<string> {
  const variantId = await variantIdBySku(sku);
  const phone = `0300${String(1230000 + seed).padStart(7, "0")}`;
  const quote = await quoteCart({ lines: [{ variantId, quantity }], couponCode, phone }, { ip: nextIp() });
  if (!quote.ok) throw new Error(`quoteCart failed: ${quote.error}`);
  if (quote.quote.coupon.status !== "applied") throw new Error(`Coupon ${couponCode} did not apply: ${JSON.stringify(quote.quote.coupon)}`);

  const result = await createOrder(
    {
      checkoutToken: randomUUID(),
      name: `${TAG}Coupon Customer ${seed}`,
      phone,
      email: "",
      country: "PK",
      city: "Karachi",
      addressLine: `House ${seed}, Street 4, DHA Phase 6, Karachi`,
      postalCode: "",
      note: "",
      paymentMethod: "cod",
      proofToken: null,
      lines: [{ variantId, quantity }],
      couponCode: quote.quote.storedCouponCode,
      expectedTotal: quote.quote.expectedTotal,
    },
    { ip: nextIp() },
  );
  if (!result.ok) throw new Error(`createOrder failed: ${result.error}`);
  return result.orderNumber;
}

async function seedPromotions(): Promise<void> {
  const actorId = await getDeveloperActorId();

  for (const seed of DISCOUNTS) await placeDiscount(seed, actorId);
  console.log(`Placed ${DISCOUNTS.length} demo discounts.`);

  for (const seed of COUPONS) await placeCoupon(seed, actorId);
  console.log(`Placed ${COUPONS.length} demo coupons.`);

  const placed = [
    await placeCouponOrder(1, `${COUPON_PREFIX}SAVE10`, "RSH-TW-001-WHT", 1),
    await placeCouponOrder(2, `${COUPON_PREFIX}SAVE10`, "RSH-TW-002", 1),
    await placeCouponOrder(3, `${COUPON_PREFIX}ONCE`, "RSH-TW-002", 1),
  ];
  console.log(`Placed ${placed.length} COD orders with demo coupons (${placed.join(", ")}); DEMO-ONCE is now used up.`);
}

// ── Entry point ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertDevDatabase();
  const mode = process.argv[2];

  if (mode === "reset") {
    await resetPromotions();
  } else if (mode === "seed") {
    await seedPromotions();
  } else {
    throw new Error("Usage: tsx scripts/seed-demo-promotions.ts <reset|seed>");
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
