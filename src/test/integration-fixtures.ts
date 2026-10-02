/**
 * Shared set-up for the integration suites (ARCHITECTURE.md §8). vitest.setup.ts points the app's
 * db client at TEST_DATABASE_URL and UPLOAD_DIR at a temp folder; each suite wipes and rebuilds
 * these fixtures, never depending on the seed. Suites run one file at a time
 * (`fileParallelism: false`), since they share the database.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { permissions, rateLimits, rolePermissions, roles, sessions, users } from "@/server/db/schema/access-control";
import { auditLogs } from "@/server/db/schema/audit";
import { categories, productImages, productVariants, products } from "@/server/db/schema/catalog";
import { pushSubscriptions } from "@/server/db/schema/notify";
import { orderItems, orderStatusHistory, orders, paymentProofs } from "@/server/db/schema/orders";
import { couponUsages, coupons } from "@/server/db/schema/promotions";
import { settings } from "@/server/db/schema/settings";
import { shippingZoneAreas, shippingZones } from "@/server/db/schema/shipping";
import { wholesaleInquiries, wholesaleInquiryItems, wholesaleInquiryNotes } from "@/server/db/schema/wholesale";

type Db = (typeof import("@/server/db/client"))["db"];

export type FixtureIds = { plate: number; vaseWhite: number; vaseBlack: number; karachiZone: number; internationalZone: number; coupon: number };

/** Belt and braces: whatever the env says, only a *_test database gets wiped. */
export function assertTestDatabase(): void {
  const databaseName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  if (!databaseName.endsWith("_test")) throw new Error(`Refusing to run integration tests against "${databaseName}".`);
}

export async function resetTables(db: Db): Promise<void> {
  // `categories.parent_id` self-references the same table (S10 phase 1), so a plain bulk delete
  // can fail with a child row still pointing at a parent row not yet gone; breaking every
  // self-reference first avoids ordering the deletes row by row.
  await db.update(categories).set({ parentId: null });

  // Children before parents, so no foreign-key toggling is needed.
  for (const table of [
    auditLogs,
    pushSubscriptions,
    settings,
    wholesaleInquiryNotes,
    wholesaleInquiryItems,
    wholesaleInquiries,
    orderStatusHistory,
    paymentProofs,
    couponUsages,
    orderItems,
    orders,
    coupons,
    productImages,
    productVariants,
    products,
    categories,
    shippingZoneAreas,
    shippingZones,
    rateLimits,
    sessions,
    users,
    rolePermissions,
    roles,
    permissions,
  ]) {
    await db.delete(table);
  }
}

export async function seedFixtures(db: Db): Promise<FixtureIds> {
  const [category] = await db.insert(categories).values({ name: "Test Tableware", slug: "test-tableware" });
  const [plate] = await db
    .insert(products)
    .values({ categoryId: category.insertId, name: "Test Plate", slug: "test-plate", price: "1000.00", status: "active" });
  const [vase] = await db
    .insert(products)
    .values({ categoryId: category.insertId, name: "Test Vase", slug: "test-vase", price: "2500.00", status: "active" });

  const variant = (values: typeof productVariants.$inferInsert) => db.insert(productVariants).values(values);
  const zone = (values: typeof shippingZones.$inferInsert) => db.insert(shippingZones).values(values);

  // Plenty of plates: most tests take two each and share this one fixture.
  const [plateVariant] = await variant({ productId: plate.insertId, sku: "TEST-PLATE", label: "Default", attributes: "{}", stock: 1000 });
  const [vaseWhite] = await variant({ productId: vase.insertId, sku: "TEST-VASE-WHT", label: "White", attributes: '{"Colour":"White"}', stock: 1 });
  const [vaseBlack] = await variant({
    productId: vase.insertId,
    sku: "TEST-VASE-BLK",
    label: "Black",
    attributes: '{"Colour":"Black"}',
    stock: 5,
    isActive: false,
  });

  const [karachiZone] = await zone({ name: "Karachi", mode: "quote", flatRate: "0.00", codEnabled: true });
  const [pakistanZone] = await zone({ name: "Pakistan", mode: "quote", flatRate: "0.00", codEnabled: true });
  const [internationalZone] = await zone({ name: "International", mode: "quote", flatRate: "0.00", codEnabled: false, isFallback: true });
  await db.insert(shippingZoneAreas).values([
    { zoneId: karachiZone.insertId, countryCode: "PK", city: "karachi" },
    { zoneId: pakistanZone.insertId, countryCode: "PK", city: null },
  ]);

  const [coupon] = await db.insert(coupons).values({ code: "TESTCOUPON", type: "percent", value: "10.00", perCustomerLimit: 1, isActive: true });

  return {
    plate: plateVariant.insertId,
    vaseWhite: vaseWhite.insertId,
    vaseBlack: vaseBlack.insertId,
    karachiZone: karachiZone.insertId,
    internationalZone: internationalZone.insertId,
    coupon: coupon.insertId,
  };
}

/** A checkout request for two plates to Karachi; override what a test needs. */
export function checkoutInput(ids: FixtureIds, overrides: Record<string, unknown> = {}) {
  return {
    checkoutToken: crypto.randomUUID(),
    name: "Test Customer",
    phone: "0300 1234567",
    email: "",
    country: "PK",
    city: "Karachi",
    addressLine: "House 1, Street 2, DHA Phase 6",
    postalCode: "",
    note: "",
    paymentMethod: "cod",
    proofToken: null,
    lines: [{ variantId: ids.plate, quantity: 2 }],
    couponCode: null,
    expectedTotal: "2000.00",
    ...overrides,
  };
}

/**
 * A signed-in panel user whose role holds exactly `permissionKeys`. Returns the user id and the
 * `panel_session` cookie value; `hashToken` comes from server/auth/session (imported lazily by
 * the suites, like every app module).
 */
export async function createStaffSession(
  db: Db,
  hashToken: (token: string) => string,
  permissionKeys: string[],
): Promise<{ userId: number; token: string }> {
  const [role] = await db.insert(roles).values({ key: `test-${randomBytes(4).toString("hex")}`, name: "Test role" });
  for (const key of permissionKeys) {
    const [existing] = await db.select().from(permissions).where(eq(permissions.key, key));
    const permissionId = existing?.id ?? (await db.insert(permissions).values({ key }))[0].insertId;
    await db.insert(rolePermissions).values({ roleId: role.insertId, permissionId });
  }
  const [user] = await db
    .insert(users)
    .values({ name: "Staff", email: `${randomBytes(4).toString("hex")}@test.local`, passwordHash: "unused", roleId: role.insertId });
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ id: hashToken(token), userId: user.insertId, expiresAt: new Date(Date.now() + 60_000) });
  return { userId: user.insertId, token };
}
