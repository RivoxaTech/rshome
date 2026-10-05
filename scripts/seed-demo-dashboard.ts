/**
 * Dev-only demo data for manual QA of the admin dashboard (S16). Two modes:
 *
 *   npm run db:seed:dashboard   places ~120 orders through the real createOrder service (varied
 *                               products/quantities, bank transfer and COD) over the last 60 days,
 *                               then backdates `created_at` and advances each to a realistic status
 *                               (completed, processing, delivery, a fresh need-review queue, a few
 *                               cancelled and rejected) with direct SQL — createOrder's own
 *                               transaction already handles stock, snapshots and the one goods
 *                               screenshot every bank order needs; this script only fast-forwards
 *                               the order past that point, generating a second (delivery-charge)
 *                               screenshot where the stage needs one. Also places ~15 wholesale
 *                               inquiries over the same span, with a new/contacted/closed mix.
 *   npm run db:reset:dashboard  removes exactly what this script created (every order and inquiry
 *                               whose name carries this script's tag), restoring the stock any of
 *                               its still-open orders were holding — never a blanket reset, so
 *                               `db:seed:orders`/`db:seed:wholesale` data placed alongside it is
 *                               untouched, and `db:reset:orders`/`db:reset:wholesale` keep working.
 *
 * Refuses to run against anything but the "rs_home" database (never "rs_home_test" or a host DB).
 */
import "../src/server/load-env";
import { randomInt, randomUUID } from "node:crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import sharp from "sharp";
import { createOrder } from "../src/features/checkout/service";
import { uploadCheckoutProof } from "../src/features/payments/service";
import { decimalToPaisa, formatMoney, paisaToDecimal } from "../src/features/pricing/money";
import { createWholesaleInquiry } from "../src/features/wholesale/service";
import { db, pool } from "../src/server/db/client";
import { roles, users } from "../src/server/db/schema/access-control";
import { productVariants, products } from "../src/server/db/schema/catalog";
import { orderItems, orderStatusHistory, orders, paymentProofs } from "../src/server/db/schema/orders";
import { wholesaleInquiries, wholesaleInquiryItems, wholesaleInquiryNotes } from "../src/server/db/schema/wholesale";
import { saveProof, deleteProofFile } from "../src/server/storage/proofs";
import { env } from "../src/server/env";

/** Tags every row this script creates, so the targeted reset never touches other dev seed data. */
const TAG = "Dashboard Demo — ";

function assertDevDatabase(): void {
  const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
  if (databaseName !== "rs_home") {
    throw new Error(`Refusing to run against database "${databaseName}" — this script only runs against "rs_home", never a *_test or host database.`);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Reset ───────────────────────────────────────────────────────────────────────────────────

async function resetDashboard(): Promise<void> {
  const taggedOrders = await db
    .select({ id: orders.id, stockRestoredAt: orders.stockRestoredAt })
    .from(orders)
    .where(like(orders.customerName, `${TAG}%`));
  const orderIds = taggedOrders.map((row) => row.id);

  let stockRestored = 0;
  if (orderIds.length > 0) {
    // Only for orders this script never already "cancelled"/"rejected" (and so already restored),
    // the same stockRestoredAt guard the real app uses — a blanket restore would double-credit them.
    const openOrderIds = taggedOrders.filter((row) => !row.stockRestoredAt).map((row) => row.id);
    if (openOrderIds.length > 0) {
      const items = await db
        .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, openOrderIds));
      for (const item of items) {
        await db.update(productVariants).set({ stock: sqlIncrement(item.quantity) }).where(eq(productVariants.id, item.variantId));
        stockRestored += 1;
      }
    }

    const proofs = await db.select({ filePath: paymentProofs.filePath }).from(paymentProofs).where(inArray(paymentProofs.orderId, orderIds));
    for (const proof of proofs) if (proof.filePath) await deleteProofFile(proof.filePath);

    await db.delete(paymentProofs).where(inArray(paymentProofs.orderId, orderIds));
    await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, orderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }

  const taggedInquiries = await db.select({ id: wholesaleInquiries.id }).from(wholesaleInquiries).where(like(wholesaleInquiries.name, `${TAG}%`));
  const inquiryIds = taggedInquiries.map((row) => row.id);
  if (inquiryIds.length > 0) {
    await db.delete(wholesaleInquiryNotes).where(inArray(wholesaleInquiryNotes.inquiryId, inquiryIds));
    await db.delete(wholesaleInquiryItems).where(inArray(wholesaleInquiryItems.inquiryId, inquiryIds));
  }
  const [inquiryResult] = await db.delete(wholesaleInquiries).where(like(wholesaleInquiries.name, `${TAG}%`));
  await unboostStock();

  console.log("Reset complete:");
  console.log(`  dashboard demo orders deleted: ${orderIds.length}`);
  console.log(`  variant stock rows credited back: ${stockRestored}`);
  console.log(`  dashboard demo wholesale inquiries deleted: ${inquiryResult.affectedRows}`);
}

/** `col = col + n`, for crediting stock back. */
function sqlIncrement(amount: number) {
  return sql`${productVariants.stock} + ${amount}`;
}

// ── Seed ────────────────────────────────────────────────────────────────────────────────────

let ipCounter = 0;
const nextIp = () => `dashboard-seed-${++ipCounter}`;

// Never a tray SKU: that category carries the seeded sample discount (scripts/seed.ts), which
// would make the line's actual priced total differ from this script's plain, undiscounted maths
// (the same reason scripts/seed-demo-orders.ts avoids it).
const SKU_POOL = [
  "RSH-TW-001-WHT",
  "RSH-TW-001-IVR",
  "RSH-TW-002",
  "RSH-TS-001-6PC",
  "RSH-TS-001-12PC",
  "RSH-TS-002",
  "RSH-DC-001-WHT",
  "RSH-DC-001-BLK",
  "RSH-DC-002",
] as const;

/**
 * ~120 orders need far more stock than these variants are seeded with (10-20 each, sized for the
 * handful of orders `db:seed:orders` places). Boosted here and reversed in `resetDashboard` by the
 * same fixed amount, so a seed-then-reset cycle leaves the catalogue's real seed stock unchanged —
 * see `boostStock`/`unboostStock`.
 */
const STOCK_BOOST = 400;

async function boostStock(): Promise<void> {
  for (const sku of SKU_POOL) await db.update(productVariants).set({ stock: sqlIncrement(STOCK_BOOST) }).where(eq(productVariants.sku, sku));
}

async function unboostStock(): Promise<void> {
  for (const sku of SKU_POOL) {
    await db
      .update(productVariants)
      .set({ stock: sql`greatest(${productVariants.stock} - ${STOCK_BOOST}, 0)` })
      .where(eq(productVariants.sku, sku));
  }
}

const FIRST_NAMES = ["Ayesha", "Bilal", "Hassan", "Sana", "Usman", "Zainab", "Mahnoor", "Kashif", "Hira", "Faisal", "Nida", "Ahmed", "Sadia", "Omar", "Mehreen"];
const LAST_NAMES = ["Raza", "Ahmed", "Ali", "Tariq", "Farooq", "Sheikh", "Khan", "Malik", "Qureshi", "Siddiqui"];
const CITIES = ["Karachi", "Lahore", "Islamabad", "Faisalabad", "Rawalpindi", "Multan", "Peshawar", "Quetta", "Hyderabad", "Sialkot"];

function randomCustomer(seed: number): { name: string; phone: string; city: string; addressLine: string } {
  const first = FIRST_NAMES[seed % FIRST_NAMES.length];
  const last = LAST_NAMES[(seed * 3 + 1) % LAST_NAMES.length];
  const city = CITIES[(seed * 5 + 2) % CITIES.length];
  return {
    name: `${TAG}${first} ${last}`,
    // A valid Pakistani mobile is `03` + 9 digits (`lib/phone.ts`'s `^03\d{9}$`).
    phone: `03${String(10 + (seed % 90))}${String(1000000 + seed).slice(-7)}`,
    city,
    addressLine: `House ${(seed % 90) + 1}, Street ${(seed % 20) + 1}, ${city}`,
  };
}

function randomItems(seed: number): { sku: string; quantity: number }[] {
  const count = 1 + (seed % 3);
  const items: { sku: string; quantity: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const sku = SKU_POOL[(seed + i * 4) % SKU_POOL.length];
    if (items.some((item) => item.sku === sku)) continue;
    items.push({ sku, quantity: 1 + ((seed + i) % 4) });
  }
  return items;
}

async function variantForOrder(sku: string): Promise<{ id: number; unitPrice: string }> {
  const [row] = await db
    .select({ id: productVariants.id, priceOverride: productVariants.priceOverride, price: products.price })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.sku, sku));
  if (!row) throw new Error(`Seed variant ${sku} not found. Run "npm run db:seed" first.`);
  return { id: row.id, unitPrice: row.priceOverride ?? row.price };
}

/** A plain receipt-style image (sharp), the amount rendered on it so screenshots are tellable apart. */
async function receiptImage(label: string, amountPaisa: number): Promise<Buffer> {
  const amount = formatMoney(amountPaisa).replace(/&/g, "&amp;");
  const svg = `<svg width="700" height="1000" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f2ece1"/>
    <rect x="36" y="36" width="628" height="928" fill="#ffffff" stroke="#d8c8a8" stroke-width="2"/>
    <text x="350" y="150" font-size="24" text-anchor="middle" font-family="sans-serif" fill="#3a2f22">${label}</text>
    <text x="350" y="230" font-size="18" text-anchor="middle" font-family="sans-serif" fill="#7a6f5a">Amount sent</text>
    <text x="350" y="300" font-size="42" font-weight="bold" text-anchor="middle" font-family="sans-serif" fill="#1f6f4a">${amount}</text>
    <text x="350" y="940" font-size="13" text-anchor="middle" font-family="sans-serif" fill="#9a8f7a">Demo seed data - not a real transaction</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

type PlacedOrder = { orderNumber: string; id: number; paymentMethod: "cod" | "bank_transfer"; totalPaisa: number };

async function placeOrder(seed: number, paymentMethod: "cod" | "bank_transfer"): Promise<PlacedOrder> {
  const customer = randomCustomer(seed);
  const items = randomItems(seed);
  const lines: { variantId: number; quantity: number }[] = [];
  let totalPaisa = 0;
  for (const item of items) {
    const variant = await variantForOrder(item.sku);
    lines.push({ variantId: variant.id, quantity: item.quantity });
    totalPaisa += decimalToPaisa(variant.unitPrice) * item.quantity;
  }

  const checkoutFields = {
    checkoutToken: randomUUID(),
    name: customer.name,
    phone: customer.phone,
    email: "",
    country: "PK",
    city: customer.city,
    addressLine: customer.addressLine,
    postalCode: "",
    note: "",
    couponCode: null,
  };

  let proofToken: string | null = null;
  if (paymentMethod === "bank_transfer") {
    const upload = await uploadCheckoutProof(async () => {
      const png = await receiptImage("Bank Transfer Receipt", totalPaisa);
      return new File([new Uint8Array(png)], "receipt.png", { type: "image/png" });
    }, { ip: nextIp() });
    if (!upload.ok) throw new Error(`Receipt upload failed for ${customer.name}: ${upload.error}`);
    proofToken = upload.token;
  }

  const result = await createOrder(
    { ...checkoutFields, paymentMethod, proofToken, lines, expectedTotal: paisaToDecimal(totalPaisa) },
    { ip: nextIp() },
  );
  if (!result.ok) throw new Error(`createOrder failed for ${customer.name}: ${result.error}`);

  const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, result.orderNumber));
  return { orderNumber: result.orderNumber, id: row.id, paymentMethod, totalPaisa };
}

type AdvanceTarget = {
  createdAt: Date;
  orderStatus: typeof orders.$inferInsert.orderStatus;
  paymentStatus: typeof orders.$inferInsert.paymentStatus;
  /** Bank only: whether the goods screenshot is verified or rejected by this stage. */
  goodsProofStatus?: "verified" | "rejected";
  /** Bank only: a delivery charge screenshot at this stage, if the order has reached one. */
  deliveryProof?: "submitted" | "verified";
  shippingChargePaisa?: number;
  courier?: string;
  trackingNote?: string;
  rejectionReason?: string;
  restoreStock?: boolean;
};

async function advanceOrder(placed: PlacedOrder, target: AdvanceTarget, reviewer: { id: number }): Promise<void> {
  const updates: Partial<typeof orders.$inferInsert> = {
    createdAt: target.createdAt,
    updatedAt: target.createdAt,
    orderStatus: target.orderStatus,
    paymentStatus: target.paymentStatus,
  };

  if (target.shippingChargePaisa !== undefined) {
    updates.shippingTotal = paisaToDecimal(target.shippingChargePaisa);
    updates.shippingNote = "Local courier, 1 parcel";
    updates.total = paisaToDecimal(placed.totalPaisa + target.shippingChargePaisa);
  }
  if (target.courier) {
    updates.courier = target.courier;
    updates.trackingNote = target.trackingNote ?? null;
  }
  if (target.rejectionReason) updates.rejectionReason = target.rejectionReason;
  if (target.restoreStock) updates.stockRestoredAt = target.createdAt;

  await db.update(orders).set(updates).where(eq(orders.id, placed.id));

  if (placed.paymentMethod === "bank_transfer" && target.goodsProofStatus) {
    await db
      .update(paymentProofs)
      .set({
        status: target.goodsProofStatus,
        rejectionReason: target.goodsProofStatus === "rejected" ? (target.rejectionReason ?? "Screenshot unclear.") : null,
        reviewedBy: reviewer.id,
        reviewedAt: target.createdAt,
      })
      .where(and(eq(paymentProofs.orderId, placed.id), eq(paymentProofs.purpose, "goods")));
  }

  if (placed.paymentMethod === "bank_transfer" && target.deliveryProof && target.shippingChargePaisa !== undefined) {
    const webp = await sharp(await receiptImage("Delivery Charge Receipt", target.shippingChargePaisa)).webp().toBuffer();
    const stored = await saveProof(webp, target.createdAt);
    await db.insert(paymentProofs).values({
      orderId: placed.id,
      purpose: "delivery",
      filePath: stored.relativePath,
      fileSize: stored.fileSize,
      status: target.deliveryProof,
      reviewedBy: target.deliveryProof === "verified" ? reviewer.id : null,
      reviewedAt: target.deliveryProof === "verified" ? target.createdAt : null,
      createdAt: target.createdAt,
    });
  }

  if (target.restoreStock) {
    const items = await db.select({ variantId: orderItems.variantId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, placed.id));
    for (const item of items) await db.update(productVariants).set({ stock: sqlIncrement(item.quantity) }).where(eq(productVariants.id, item.variantId));
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS - randomInt(0, 20 * 60 * 60 * 1000));
}

const COURIERS = ["TCS", "Leopards Courier", "M&P", "Call Courier"];

async function seedOrders(adminId: number): Promise<number> {
  let seed = 0;
  let placedCount = 0;

  async function place(paymentMethod: "cod" | "bank_transfer", target: Omit<AdvanceTarget, "createdAt">, createdAtDays: [number, number]): Promise<void> {
    seed += 1;
    const createdAt = daysAgo(randomInt(createdAtDays[0] * 10, createdAtDays[1] * 10 + 1) / 10);
    const placed = await placeOrder(seed, paymentMethod);
    await advanceOrder(placed, { ...target, createdAt }, { id: adminId });
    placedCount += 1;
  }

  // Need review (fresh, 0-4 days ago): 5 bank awaiting review, 6 COD awaiting review.
  for (let i = 0; i < 5; i += 1) await place("bank_transfer", { orderStatus: "awaiting_shipping_quote", paymentStatus: "proof_submitted" }, [0, 4]);
  for (let i = 0; i < 6; i += 1) await place("cod", { orderStatus: "awaiting_shipping_quote", paymentStatus: "cod_pending" }, [0, 4]);

  // Pending delivery charge (bank only, fresh): 4 with no screenshot yet, 3 with one awaiting review.
  for (let i = 0; i < 4; i += 1) {
    await place(
      "bank_transfer",
      { orderStatus: "pending", paymentStatus: "verified", goodsProofStatus: "verified", shippingChargePaisa: randomInt(20_000, 80_000) },
      [0, 4],
    );
  }
  for (let i = 0; i < 3; i += 1) {
    await place(
      "bank_transfer",
      {
        orderStatus: "pending",
        paymentStatus: "proof_submitted",
        goodsProofStatus: "verified",
        shippingChargePaisa: randomInt(20_000, 80_000),
        deliveryProof: "submitted",
      },
      [0, 4],
    );
  }

  // Processing: 12 bank, 12 COD, over the last 45 days.
  for (let i = 0; i < 12; i += 1) {
    await place(
      "bank_transfer",
      {
        orderStatus: "processing",
        paymentStatus: "verified",
        goodsProofStatus: "verified",
        shippingChargePaisa: randomInt(20_000, 80_000),
        deliveryProof: "verified",
      },
      [2, 45],
    );
  }
  for (let i = 0; i < 12; i += 1) {
    await place("cod", { orderStatus: "processing", paymentStatus: "cod_pending", shippingChargePaisa: randomInt(20_000, 80_000) }, [2, 45]);
  }

  // Delivery (shipped): 6 bank, 6 COD, over the last 10-50 days.
  for (let i = 0; i < 6; i += 1) {
    await place(
      "bank_transfer",
      {
        orderStatus: "shipped",
        paymentStatus: "verified",
        goodsProofStatus: "verified",
        shippingChargePaisa: randomInt(20_000, 80_000),
        deliveryProof: "verified",
        courier: COURIERS[i % COURIERS.length],
        trackingNote: `TRK${100000 + i}`,
      },
      [10, 50],
    );
  }
  for (let i = 0; i < 6; i += 1) {
    await place(
      "cod",
      { orderStatus: "shipped", paymentStatus: "cod_pending", shippingChargePaisa: randomInt(20_000, 80_000), courier: COURIERS[i % COURIERS.length], trackingNote: `TRK${200000 + i}` },
      [10, 50],
    );
  }

  // Completed: 24 bank, 24 COD, spread across the full 60 days.
  for (let i = 0; i < 24; i += 1) {
    await place(
      "bank_transfer",
      {
        orderStatus: "delivered",
        paymentStatus: "verified",
        goodsProofStatus: "verified",
        shippingChargePaisa: randomInt(20_000, 80_000),
        deliveryProof: "verified",
        courier: COURIERS[i % COURIERS.length],
        trackingNote: `TRK${300000 + i}`,
      },
      [3, 59],
    );
  }
  for (let i = 0; i < 24; i += 1) {
    await place(
      "cod",
      {
        orderStatus: "delivered",
        paymentStatus: "cod_collected",
        shippingChargePaisa: randomInt(20_000, 80_000),
        courier: COURIERS[i % COURIERS.length],
        trackingNote: `TRK${400000 + i}`,
      },
      [3, 59],
    );
  }

  // Cancelled: 6 bank, 6 COD. Rejected: 4 bank, 2 COD.
  for (let i = 0; i < 6; i += 1) {
    await place(
      "bank_transfer",
      { orderStatus: "cancelled", paymentStatus: "rejected", goodsProofStatus: "verified", rejectionReason: "Customer asked to cancel.", restoreStock: true },
      [1, 55],
    );
  }
  for (let i = 0; i < 6; i += 1) {
    await place("cod", { orderStatus: "cancelled", paymentStatus: "cod_pending", rejectionReason: "Customer asked to cancel.", restoreStock: true }, [1, 55]);
  }
  for (let i = 0; i < 4; i += 1) {
    await place(
      "bank_transfer",
      { orderStatus: "rejected", paymentStatus: "rejected", goodsProofStatus: "rejected", rejectionReason: "Screenshot didn't match the order total.", restoreStock: true },
      [1, 55],
    );
  }
  for (let i = 0; i < 2; i += 1) {
    await place("cod", { orderStatus: "rejected", paymentStatus: "cod_pending", rejectionReason: "Unable to reach the customer.", restoreStock: true }, [1, 55]);
  }

  return placedCount;
}

async function seedWholesale(adminId: number): Promise<number> {
  void adminId;
  let seed = 0;
  let placedCount = 0;

  async function place(status: "new" | "contacted" | "closed", createdAtDays: [number, number]): Promise<void> {
    seed += 1;
    const customer = randomCustomer(1000 + seed);
    const items = randomItems(1000 + seed).map((item) => ({ itemName: item.sku, quantity: String(item.quantity * 10) }));
    const result = await createWholesaleInquiry(
      {
        name: customer.name,
        business: "",
        businessType: ["retail", "restaurant_cafe", "hotel", "event", "other"][seed % 5] as "retail" | "restaurant_cafe" | "hotel" | "event" | "other",
        phone: customer.phone,
        email: "",
        city: customer.city,
        neededByDate: "",
        items,
        message: "Dashboard demo inquiry.",
        website: "",
      },
      { ip: nextIp() },
    );
    if (!result.ok) throw new Error(`createWholesaleInquiry failed for ${customer.name}: ${result.error}`);

    const createdAt = daysAgo(randomInt(createdAtDays[0] * 10, createdAtDays[1] * 10 + 1) / 10);
    await db
      .update(wholesaleInquiries)
      .set({ status, createdAt, updatedAt: createdAt })
      .where(eq(wholesaleInquiries.phone, customer.phone));
    placedCount += 1;
  }

  for (let i = 0; i < 6; i += 1) await place("new", [0, 7]);
  for (let i = 0; i < 5; i += 1) await place("contacted", [8, 30]);
  for (let i = 0; i < 4; i += 1) await place("closed", [15, 60]);

  return placedCount;
}

async function seedDashboard(): Promise<void> {
  const [admin] = await db.select({ id: users.id }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(roles.key, "admin")).limit(1);
  if (!admin) throw new Error(`No admin user found. Run "npm run db:seed" first.`);

  await boostStock();
  const orderCount = await seedOrders(admin.id);
  console.log(`Placed and advanced ${orderCount} demo orders.`);
  const wholesaleCount = await seedWholesale(admin.id);
  console.log(`Placed ${wholesaleCount} demo wholesale inquiries.`);
}

// ── Entry point ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertDevDatabase();
  const mode = process.argv[2];

  if (mode === "reset") {
    await resetDashboard();
  } else if (mode === "seed") {
    await seedDashboard();
  } else {
    throw new Error('Usage: tsx scripts/seed-demo-dashboard.ts <reset|seed>');
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
