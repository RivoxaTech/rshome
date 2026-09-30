/**
 * Dev-only demo orders for manual QA of the panel (S9). Two modes:
 *
 *   npm run db:reset:orders   deletes every order and everything hanging off it, restores
 *                             variant stock to the seed value (from scripts/seed.ts), resets
 *                             coupon usage, clears rate limits, deletes stored proof files.
 *   npm run db:seed:orders    places fresh orders through the real createOrder service (so
 *                             stock, snapshots and history are correct): 3 bank-transfer orders
 *                             with a generated receipt screenshot uploaded through the same
 *                             proof-token path as checkout, and 3 cash-on-delivery orders. All
 *                             six land in Need review. Pass --many to also add 40 extra COD
 *                             orders, for testing pagination.
 *
 * Refuses to run against anything but the "rs_home" database (never "rs_home_test" or a host DB).
 */
import "../src/server/load-env";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { createOrder } from "../src/features/checkout/service";
import { getOrderCounts } from "../src/features/orders/staff-service";
import { uploadCheckoutProof } from "../src/features/payments/service";
import { decimalToPaisa, formatMoney, paisaToDecimal } from "../src/features/pricing/money";
import { db, pool } from "../src/server/db/client";
import { rateLimits } from "../src/server/db/schema/access-control";
import { auditLogs } from "../src/server/db/schema/audit";
import { productVariants, products } from "../src/server/db/schema/catalog";
import { orderItems, orderStatusHistory, orders, paymentProofs } from "../src/server/db/schema/orders";
import { couponUsages, coupons } from "../src/server/db/schema/promotions";
import { env } from "../src/server/env";
import { PRODUCT_SEEDS } from "./seed";

function assertDevDatabase(): void {
  const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
  if (databaseName !== "rs_home") {
    throw new Error(`Refusing to run against database "${databaseName}" — this script only runs against "rs_home", never a *_test or host database.`);
  }
}

// ── Reset ───────────────────────────────────────────────────────────────────────────────────

async function resetOrders(): Promise<void> {
  const [auditResult] = await db.delete(auditLogs).where(inArray(auditLogs.entity, ["order", "payment_proof"]));
  const [historyResult] = await db.delete(orderStatusHistory);
  const [proofResult] = await db.delete(paymentProofs);
  const [usageResult] = await db.delete(couponUsages);
  const [itemResult] = await db.delete(orderItems);
  const [orderResult] = await db.delete(orders);
  const [couponResult] = await db.update(coupons).set({ usedCount: 0 });
  const [rateLimitResult] = await db.delete(rateLimits);

  let stockRestored = 0;
  for (const product of PRODUCT_SEEDS) {
    for (const variant of product.variants) {
      const [result] = await db.update(productVariants).set({ stock: variant.stock }).where(eq(productVariants.sku, variant.sku));
      stockRestored += result.affectedRows;
    }
  }

  const proofsDir = path.join(env.UPLOAD_DIR, "proofs");
  await rm(proofsDir, { recursive: true, force: true });

  console.log("Reset complete:");
  console.log(`  orders deleted: ${orderResult.affectedRows}`);
  console.log(`  order items deleted: ${itemResult.affectedRows}`);
  console.log(`  order status history rows deleted: ${historyResult.affectedRows}`);
  console.log(`  payment proofs deleted: ${proofResult.affectedRows}`);
  console.log(`  coupon usages deleted: ${usageResult.affectedRows}`);
  console.log(`  audit log rows deleted (order/payment_proof): ${auditResult.affectedRows}`);
  console.log(`  coupons reset to used_count 0: ${couponResult.affectedRows}`);
  console.log(`  rate limit buckets cleared: ${rateLimitResult.affectedRows}`);
  console.log(`  variant stock rows restored to seed values: ${stockRestored}`);
  console.log(`  proof files removed: ${proofsDir}`);
}

// ── Seed ────────────────────────────────────────────────────────────────────────────────────

let ipCounter = 0;
const nextIp = () => `demo-seed-${++ipCounter}`;

async function variantForOrder(sku: string): Promise<{ id: number; unitPrice: string }> {
  const [row] = await db
    .select({ id: productVariants.id, priceOverride: productVariants.priceOverride, price: products.price })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.sku, sku));
  if (!row) throw new Error(`Seed variant ${sku} not found. Run "npm run db:seed" first.`);
  return { id: row.id, unitPrice: row.priceOverride ?? row.price };
}

/** One line, priced from the live catalogue (no discounts or coupons on these demo orders). */
async function lineFor(sku: string, quantity: number): Promise<{ variantId: number; quantity: number; paisa: number }> {
  const variant = await variantForOrder(sku);
  return { variantId: variant.id, quantity, paisa: decimalToPaisa(variant.unitPrice) * quantity };
}

type DemoCustomer = {
  name: string;
  phone: string;
  email?: string;
  country: string;
  city: string;
  addressLine: string;
  note?: string;
};

/** A plain receipt-style image (sharp), the amount rendered on it so screenshots are tellable apart. */
async function receiptImage(amountPaisa: number): Promise<Buffer> {
  const amount = formatMoney(amountPaisa).replace(/&/g, "&amp;");
  const svg = `<svg width="700" height="1000" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f2ece1"/>
    <rect x="36" y="36" width="628" height="928" fill="#ffffff" stroke="#d8c8a8" stroke-width="2"/>
    <text x="350" y="150" font-size="26" text-anchor="middle" font-family="sans-serif" fill="#3a2f22">Bank Transfer Receipt</text>
    <text x="350" y="230" font-size="18" text-anchor="middle" font-family="sans-serif" fill="#7a6f5a">Amount sent</text>
    <text x="350" y="300" font-size="42" font-weight="bold" text-anchor="middle" font-family="sans-serif" fill="#1f6f4a">${amount}</text>
    <text x="350" y="940" font-size="13" text-anchor="middle" font-family="sans-serif" fill="#9a8f7a">Demo seed data - not a real transaction</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function checkoutFields(customer: DemoCustomer) {
  return {
    checkoutToken: randomUUID(),
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? "",
    country: customer.country,
    city: customer.city,
    addressLine: customer.addressLine,
    postalCode: "",
    note: customer.note ?? "",
    couponCode: null,
  };
}

async function placeBankOrder(customer: DemoCustomer, sku: string, quantity: number): Promise<string> {
  const line = await lineFor(sku, quantity);
  const upload = await uploadCheckoutProof(async () => {
    const png = await receiptImage(line.paisa);
    return new File([new Uint8Array(png)], "receipt.png", { type: "image/png" });
  }, { ip: nextIp() });
  if (!upload.ok) throw new Error(`Receipt upload failed for ${customer.name}: ${upload.error}`);

  const result = await createOrder(
    {
      ...checkoutFields(customer),
      paymentMethod: "bank_transfer",
      proofToken: upload.token,
      lines: [{ variantId: line.variantId, quantity: line.quantity }],
      expectedTotal: paisaToDecimal(line.paisa),
    },
    { ip: nextIp() },
  );
  if (!result.ok) throw new Error(`createOrder failed for ${customer.name}: ${result.error}`);
  return result.orderNumber;
}

async function placeCodOrder(customer: DemoCustomer, sku: string, quantity: number): Promise<string> {
  const line = await lineFor(sku, quantity);
  const result = await createOrder(
    {
      ...checkoutFields(customer),
      paymentMethod: "cod",
      proofToken: null,
      lines: [{ variantId: line.variantId, quantity: line.quantity }],
      expectedTotal: paisaToDecimal(line.paisa),
    },
    { ip: nextIp() },
  );
  if (!result.ok) throw new Error(`createOrder failed for ${customer.name}: ${result.error}`);
  return result.orderNumber;
}

const BANK_ORDERS: { customer: DemoCustomer; sku: string; quantity: number }[] = [
  {
    customer: {
      name: "Ayesha Raza",
      phone: "0301 2345678",
      email: "ayesha.raza@example.com",
      country: "PK",
      city: "Karachi",
      addressLine: "House 12, Street 4, DHA Phase 6",
    },
    sku: "RSH-TW-001-WHT",
    quantity: 1,
  },
  {
    customer: {
      name: "Bilal Ahmed",
      phone: "0322 9876543",
      email: "bilal.ahmed@example.com",
      country: "PK",
      city: "Lahore",
      addressLine: "House 45-B, Model Town",
    },
    sku: "RSH-TS-001-6PC",
    quantity: 1,
  },
  {
    customer: {
      name: "Hassan Ali",
      phone: "+44 7911 123456",
      email: "hassan.ali@example.co.uk",
      country: "GB",
      city: "London",
      addressLine: "24 Baker Street",
    },
    sku: "RSH-DC-001-WHT",
    quantity: 2,
  },
];

const COD_ORDERS: { customer: DemoCustomer; sku: string; quantity: number }[] = [
  {
    customer: {
      name: "Sana Tariq",
      phone: "0333 4455667",
      country: "PK",
      city: "Karachi",
      addressLine: "Flat 3B, Clifton Block 4",
    },
    sku: "RSH-TW-002",
    quantity: 1,
  },
  {
    customer: {
      name: "Usman Farooq",
      phone: "0345 1122334",
      country: "PK",
      city: "Islamabad",
      addressLine: "House 7, Street 21, F-10/2",
      note: "Please gift-wrap, it's a birthday present.",
    },
    sku: "RSH-TS-002",
    quantity: 1,
  },
  {
    customer: {
      name: "Zainab Sheikh",
      phone: "0312 6677889",
      country: "PK",
      city: "Faisalabad",
      addressLine: "House 9, Peoples Colony",
    },
    sku: "RSH-DC-002",
    quantity: 1,
  },
];

const EXTRA_CITIES = ["Karachi", "Lahore", "Islamabad", "Faisalabad", "Rawalpindi", "Multan", "Peshawar", "Quetta"];
// Rotated so 40 extra orders never exhaust any one variant's seed stock (each starts at 20).
// Never a "trays" SKU: that category carries the seeded sample discount (scripts/seed.ts), which
// would make the line's actual price differ from this script's plain, undiscounted total.
const EXTRA_SKUS = ["RSH-TW-002", "RSH-TS-002", "RSH-DC-002", "RSH-TW-001-WHT"];

async function seedOrders(many: boolean): Promise<void> {
  const placed: string[] = [];
  for (const order of BANK_ORDERS) placed.push(await placeBankOrder(order.customer, order.sku, order.quantity));
  for (const order of COD_ORDERS) placed.push(await placeCodOrder(order.customer, order.sku, order.quantity));
  console.log(`Placed ${placed.length} demo orders: ${placed.join(", ")}`);

  if (many) {
    for (let index = 0; index < 40; index += 1) {
      const city = EXTRA_CITIES[index % EXTRA_CITIES.length];
      const orderNumber = await placeCodOrder(
        {
          name: `Pagination Test Customer ${index + 1}`,
          phone: `030${index % 10} ${String(1000000 + index).slice(-7)}`,
          country: "PK",
          city,
          addressLine: `House ${index + 1}, Test Colony`,
        },
        EXTRA_SKUS[index % EXTRA_SKUS.length],
        1,
      );
      placed.push(orderNumber);
    }
    console.log(`Placed 40 extra COD orders for pagination.`);
  }

  const counts = await getOrderCounts();
  for (const method of ["bank_transfer", "cod"] as const) {
    console.log(`\n${method} tab counts:`);
    for (const [tab, count] of Object.entries(counts[method])) {
      if (tab === "toCheck" || tab === "needsAction") continue;
      console.log(`  ${tab}: ${count}`);
    }
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertDevDatabase();
  const mode = process.argv[2];
  const many = process.argv.includes("--many");

  if (mode === "reset") {
    await resetOrders();
  } else if (mode === "seed") {
    await seedOrders(many);
  } else {
    throw new Error('Usage: tsx scripts/seed-demo-orders.ts <reset|seed> [--many]');
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
