/**
 * `npm run db:seed -- --no-samples` (S22; docs/DEPLOY.md §5): the production form of the seed.
 * It must create the fixed rows (permissions, system roles, the two staff users, the three
 * shipping zones, every settings key), create no catalogue, image, sample discount or coupon,
 * and never delete or overwrite anything already in the database. Skips without
 * TEST_DATABASE_URL, like every integration suite.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@/features/auth/permissions";
import { permissions, roles, users } from "@/server/db/schema/access-control";
import { categories, productImages, productVariants, products } from "@/server/db/schema/catalog";
import { coupons, discounts } from "@/server/db/schema/promotions";
import { settings } from "@/server/db/schema/settings";
import { shippingZoneAreas, shippingZones } from "@/server/db/schema/shipping";
import { assertTestDatabase, resetTables } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
type Db = typeof import("@/server/db/client");
type Seed = typeof import("../../scripts/seed");

const SEED_ENV = {
  SEED_DEVELOPER_EMAIL: "seed-developer@test.local",
  SEED_DEVELOPER_PASSWORD: "seed-developer-pass",
  SEED_ADMIN_EMAIL: "seed-admin@test.local",
  SEED_ADMIN_PASSWORD: "seed-admin-pass",
} as const;

const SETTINGS_KEYS = [
  "store_identity",
  "announcement_text",
  "contact",
  "social_links",
  "bank_accounts",
  "notify_owner_order_emails",
  "notify_owner_wholesale_emails",
];

describe.skipIf(!TEST_DATABASE_URL)("db:seed --no-samples (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let seed: Seed;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    assertTestDatabase();
    for (const [key, value] of Object.entries(SEED_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    ({ db, pool } = await import("@/server/db/client"));
    seed = await import("../../scripts/seed");
    await resetTables(db);
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await pool.end();
  });

  it("accepts only --no-samples", () => {
    expect(seed.parseSeedArgs([])).toEqual({ samples: true });
    expect(seed.parseSeedArgs(["--no-samples"])).toEqual({ samples: false });
    expect(() => seed.parseSeedArgs(["--samples"])).toThrow(/Unknown argument/);
    expect(() => seed.parseSeedArgs(["--no-samples", "extra"])).toThrow(/Unknown argument/);
  });

  it("creates the fixed rows, no catalogue or samples, and deletes or overwrites nothing", async () => {
    // What a live database holds before an upgrade re-runs the seed: its own catalogue and
    // promotions, a settings value staff saved, and a zone the panel's editor has changed.
    const [existingCategory] = await db.insert(categories).values({ name: "Existing", slug: "existing" });
    await db.insert(products).values({ categoryId: existingCategory.insertId, name: "Existing product", slug: "existing-product", price: "100.00", status: "active" });
    await db.insert(discounts).values({ name: "Existing discount", type: "percent", value: "5.00", targetType: "all", isActive: true });
    await db.insert(coupons).values({ code: "EXISTING", type: "percent", value: "5.00", isActive: true });
    await db.insert(settings).values({ key: "announcement_text", value: JSON.stringify("Kept by staff") });
    const [karachi] = await db.insert(shippingZones).values({ name: "Karachi", mode: "flat", flatRate: "250.00", codEnabled: false });
    await db.insert(shippingZoneAreas).values({ zoneId: karachi.insertId, countryCode: "PK", city: "karachi" });

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await seed.runSeed({ samples: false });
      // Idempotent: a second run changes nothing and throws nothing.
      await seed.runSeed({ samples: false });
    } finally {
      log.mockRestore();
    }

    // The fixed rows.
    expect((await db.select().from(permissions)).length).toBe(Object.values(PERMISSIONS).length);
    const roleRows = await db.select().from(roles);
    expect(roleRows.map((row) => row.key).sort()).toEqual(["admin", "developer"]);
    expect(roleRows.every((row) => row.isSystem)).toBe(true);
    const userRows = await db.select().from(users);
    expect(userRows.map((row) => row.email).sort()).toEqual([SEED_ENV.SEED_ADMIN_EMAIL, SEED_ENV.SEED_DEVELOPER_EMAIL]);
    const zoneRows = await db.select().from(shippingZones);
    expect(zoneRows.map((row) => row.name).sort()).toEqual(["International", "Karachi", "Pakistan"]);
    expect(zoneRows.find((row) => row.name === "International")?.isFallback).toBe(true);
    const settingRows = await db.select().from(settings);
    expect(settingRows.map((row) => row.key).sort()).toEqual([...SETTINGS_KEYS].sort());

    // Existing rows are left exactly as they were.
    const karachiAfter = zoneRows.find((row) => row.name === "Karachi");
    expect(karachiAfter).toMatchObject({ id: karachi.insertId, mode: "flat", flatRate: "250.00", codEnabled: false });
    expect((await db.select().from(shippingZoneAreas)).filter((row) => row.zoneId === karachi.insertId)).toHaveLength(1);
    expect(settingRows.find((row) => row.key === "announcement_text")?.value).toBe(JSON.stringify("Kept by staff"));

    // No sample catalogue, images, discount or coupon.
    expect((await db.select().from(categories)).map((row) => row.slug)).toEqual(["existing"]);
    expect((await db.select().from(products)).map((row) => row.slug)).toEqual(["existing-product"]);
    expect(await db.select().from(productVariants)).toHaveLength(0);
    expect(await db.select().from(productImages)).toHaveLength(0);
    expect((await db.select().from(discounts)).map((row) => row.name)).toEqual(["Existing discount"]);
    expect((await db.select().from(coupons)).map((row) => row.code)).toEqual(["EXISTING"]);
    expect(existsSync(path.join(process.env.UPLOAD_DIR ?? "", "media", "seed"))).toBe(false);
  });
});
