/**
 * The shipping zone editor against the test database (S14): the real Server Actions with the
 * literal field names the form posts, every zone rule (one fallback, no area overlap, delete
 * refused with orders, coverage/last-zone refusals, quote/flat validation, stale edit), a `flat`
 * zone priced end to end through the real quote and `createOrder` (and the stale-quote refusal),
 * COD still refused outside Pakistan whatever the switch says, resolution unchanged for the
 * seeded zones, the destination tester, and the Developer-vs-Admin RBAC wall both ways. Skips
 * without TEST_DATABASE_URL.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DEFAULT_PERMISSIONS, DEVELOPER_DEFAULT_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { orders } from "@/server/db/schema/orders";
import { shippingZoneAreas, shippingZones } from "@/server/db/schema/shipping";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const current = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/server/notify/push", () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/server/mail/transport", () => ({ sendMail: vi.fn().mockResolvedValue(undefined), isMailConfigured: () => false }));

type Db = typeof import("@/server/db/client");
type Actions = typeof import("@/app/panel/(protected)/shipping/actions");

/** A thrown `redirect()` error's digest looks like `NEXT_REDIRECT;replace;/panel/403;307;`. */
async function expectRedirectTo(run: () => Promise<unknown>, path: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    expect(digest, `expected a redirect, got ${String(error)}`).toContain(`;${path};`);
    return;
  }
  throw new Error(`expected a redirect to ${path}, but nothing was thrown`);
}

describe.skipIf(!TEST_DATABASE_URL)("shipping zone editor (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let actions: Actions;
  let staff: typeof import("./staff-service");
  let resolveShippingZone: typeof import("./service").resolveShippingZone;
  let quoteCart: typeof import("@/features/cart/service").quoteCart;
  let checkout: typeof import("@/features/checkout/service");
  let ShippingPage: (typeof import("@/app/panel/(protected)/shipping/page"))["default"];

  let ids: FixtureIds;
  let pakistanZone: number;
  let actorId: number;
  let ipCounter = 0;
  const nextIp = () => `shipping-ip-${++ipCounter}`;

  async function signInAs(permissionKeys: PermissionKey[]): Promise<void> {
    const { token, userId } = await createStaffSession(db, hashToken, permissionKeys);
    actorId = userId;
    current.cookies.set("panel_session", token);
  }

  const form = (values: Record<string, string | number> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));
    return data;
  };

  /** Exactly the fields `ZoneForm` posts. */
  const zoneFields = (overrides: Record<string, string | number> = {}) => ({
    name: "Lahore",
    mode: "quote",
    flatRate: "",
    freeOverAmount: "",
    codEnabled: "true",
    isActive: "true",
    isFallback: "false",
    areas: "PK:lahore",
    version: "",
    ...overrides,
  });

  const zoneById = async (id: number) => (await db.select().from(shippingZones).where(eq(shippingZones.id, id)))[0];
  const areasOf = (zoneId: number) => db.select().from(shippingZoneAreas).where(eq(shippingZoneAreas.zoneId, zoneId));
  const auditRows = (entityId: number, action: string) =>
    db.select().from(auditLogs).where(and(eq(auditLogs.entity, "shipping_zone"), eq(auditLogs.entityId, String(entityId)), eq(auditLogs.action, action)));

  /** The edit form's current version token for a zone. */
  const versionOf = async (id: number) => (await staff.getZoneForEdit(id))!.version;

  /** The Karachi zone's own fields, as the edit form would post them, with overrides. */
  async function karachiFields(overrides: Record<string, string | number> = {}) {
    return zoneFields({ id: ids.karachiZone, name: "Karachi", areas: "PK:karachi", version: await versionOf(ids.karachiZone), ...overrides });
  }

  async function placeKarachiOrder(overrides: Record<string, unknown> = {}) {
    const placed = await checkout.createOrder(checkoutInput(ids, overrides), { ip: nextIp() });
    if (!placed.ok) throw new Error(placed.error);
    return (await db.select().from(orders).where(eq(orders.orderNumber, placed.orderNumber)))[0];
  }

  async function quote(quantity: number, destination: { country: string; city: string } | null) {
    const result = await quoteCart({ lines: [{ variantId: ids.plate, quantity }], couponCode: null, destination }, { ip: nextIp() });
    if (!result.ok) throw new Error(result.error);
    return result.quote;
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ hashToken } = await import("@/server/auth/session"));
    actions = await import("@/app/panel/(protected)/shipping/actions");
    staff = await import("./staff-service");
    ({ resolveShippingZone } = await import("./service"));
    ({ quoteCart } = await import("@/features/cart/service"));
    checkout = await import("@/features/checkout/service");
    ({ default: ShippingPage } = await import("@/app/panel/(protected)/shipping/page"));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    current.cookies.clear();
    await resetTables(db);
    ids = await seedFixtures(db);
    pakistanZone = (await db.select().from(shippingZones).where(eq(shippingZones.name, "Pakistan")))[0].id;
    await signInAs(DEVELOPER_DEFAULT_PERMISSIONS);
  });

  describe("the seeded setup", () => {
    it("lists the three zones in quote mode with their areas, orders and the fallback marked, untouched", async () => {
      const items = await staff.listStaffZones();
      expect(items.map((item) => [item.name, item.mode, item.flatRateText, item.codEnabled, item.isActive, item.isFallback, item.areaCount, item.orderCount])).toEqual([
        ["Karachi", "quote", null, true, true, false, 1, 0],
        ["Pakistan", "quote", null, true, true, false, 1, 0],
        ["International", "quote", null, false, true, true, 0, 0],
      ]);
    });

    it("resolves exactly as before: Karachi, any other Pakistani city, and an international address", async () => {
      expect((await resolveShippingZone("PK", "Karachi"))?.id).toBe(ids.karachiZone);
      expect((await resolveShippingZone("PK", "Lahore"))?.id).toBe(pakistanZone);
      expect((await resolveShippingZone("GB", "London"))?.id).toBe(ids.internationalZone);
    });

    it("the edit view shows areas with labels and the Pakistan-only note only for a zone reaching outside Pakistan", async () => {
      const karachi = await staff.getZoneForEdit(ids.karachiZone);
      expect(karachi?.areas).toEqual([{ countryCode: "PK", city: "karachi", token: "PK:karachi", label: "Karachi, Pakistan" }]);
      expect(karachi?.coversOutsidePakistan).toBe(false);
      expect((await staff.getZoneForEdit(ids.internationalZone))?.coversOutsidePakistan).toBe(true);
    });
  });

  describe("create", () => {
    it("creates a zone with its areas through the real action (success redirects to the list) and audits it", async () => {
      await expectRedirectTo(() => actions.createZoneAction(null, form(zoneFields({ areas: "PK:lahore,PK:Islamabad", codEnabled: "false" }))), "/panel/shipping");
      const id = (await db.select().from(shippingZones).where(eq(shippingZones.name, "Lahore")))[0].id;
      expect(await zoneById(id)).toMatchObject({ name: "Lahore", mode: "quote", flatRate: "0.00", freeOverAmount: null, codEnabled: false, isActive: true, isFallback: false, sortOrder: 3 });
      expect((await areasOf(id)).map((area) => area.city)).toEqual(["lahore", "islamabad"]);
      expect(await auditRows(id, "shipping_zone.create")).toHaveLength(1);
      expect((await resolveShippingZone("PK", "Lahore"))?.id).toBe(id);
      expect((await resolveShippingZone("PK", "Multan"))?.id).toBe(pakistanZone);
    });

    it("refuses an area another zone owns, naming both, and refuses a second fallback", async () => {
      const overlap = await staff.createZone(zoneFields({ areas: "PK:lahore,PK:karachi" }), { id: actorId });
      expect(overlap.ok).toBe(false);
      if (!overlap.ok) {
        expect(overlap.fieldErrors?.areas).toContain("Karachi, Pakistan");
        expect(overlap.fieldErrors?.areas).toContain("Karachi");
      }
      const whole = await staff.createZone(zoneFields({ areas: "PK" }), { id: actorId });
      expect(whole.ok).toBe(false);
      if (!whole.ok) expect(whole.fieldErrors?.areas).toContain("Pakistan");

      const fallback = await staff.createZone(zoneFields({ isFallback: "true", areas: "" }), { id: actorId });
      expect(fallback).toEqual({ ok: false, error: staff.ONE_FALLBACK_MESSAGE, fieldErrors: { isFallback: staff.ONE_FALLBACK_MESSAGE } });
      expect(await db.select().from(shippingZones)).toHaveLength(3);
    });

    it("refuses boundary mistakes as { ok: false } with field errors (flat without a rate, an unknown area, a blank name)", async () => {
      const flat = await actions.createZoneAction(null, form(zoneFields({ mode: "flat", flatRate: "" })));
      expect(flat).toMatchObject({ ok: false, fieldErrors: { flatRate: expect.any(String) } });
      const area = await actions.createZoneAction(null, form(zoneFields({ areas: "PK:lahore,Atlantis" })));
      expect(area).toMatchObject({ ok: false, fieldErrors: { areas: expect.stringContaining("Atlantis") } });
      const name = await actions.createZoneAction(null, form(zoneFields({ name: "  " })));
      expect(name).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
    });
  });

  describe("update", () => {
    it("switching to flat needs a rate above 0; switching back to quote pins the rate to 0 and drops the threshold", async () => {
      const refused = await actions.updateZoneAction(null, form(await karachiFields({ mode: "flat", flatRate: "0" })));
      expect(refused).toMatchObject({ ok: false, fieldErrors: { flatRate: expect.any(String) } });

      // Success redirects (a throw); the row proves it.
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(await karachiFields({ mode: "flat", flatRate: "250", freeOverAmount: "10000" }))), "/panel/shipping");
      expect(await zoneById(ids.karachiZone)).toMatchObject({ mode: "flat", flatRate: "250.00", freeOverAmount: "10000.00" });
      const [update] = await auditRows(ids.karachiZone, "shipping_zone.update");
      expect(JSON.parse(update.oldValues!)).toMatchObject({ mode: "quote", flatRate: "0.00", areas: ["PK:karachi"] });
      expect(JSON.parse(update.newValues!)).toMatchObject({ mode: "flat", flatRate: "250.00", freeOverAmount: "10000.00" });

      await expectRedirectTo(async () => actions.updateZoneAction(null, form(await karachiFields({ mode: "quote", flatRate: "999", freeOverAmount: "" }))), "/panel/shipping");
      expect(await zoneById(ids.karachiZone)).toMatchObject({ mode: "quote", flatRate: "0.00", freeOverAmount: null });
    });

    it("refuses a stale edit and an area overlap on update, and moving an area between zones works once it's removed from the first", async () => {
      const version = await versionOf(ids.karachiZone);
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(zoneFields({ id: ids.karachiZone, name: "Karachi city", areas: "PK:karachi", version }))), "/panel/shipping");
      expect(await actions.updateZoneAction(null, form(zoneFields({ id: ids.karachiZone, name: "Karachi again", areas: "PK:karachi", version })))).toEqual({ ok: false, error: staff.STALE_ZONE_MESSAGE });
      expect((await zoneById(ids.karachiZone)).name).toBe("Karachi city");

      // Pakistan can't take Karachi while the Karachi zone owns it…
      const overlap = await actions.updateZoneAction(null, form(zoneFields({ id: pakistanZone, name: "Pakistan", areas: "PK,PK:karachi", version: await versionOf(pakistanZone) })));
      expect(overlap).toMatchObject({ ok: false, fieldErrors: { areas: expect.stringContaining("Karachi city") } });
      // …until the Karachi zone gives it up.
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(zoneFields({ id: ids.karachiZone, name: "Karachi city", areas: "PK:hyderabad", version: await versionOf(ids.karachiZone) }))), "/panel/shipping");
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(zoneFields({ id: pakistanZone, name: "Pakistan", areas: "PK,PK:karachi", version: await versionOf(pakistanZone) }))), "/panel/shipping");
      expect((await resolveShippingZone("PK", "Karachi"))?.id).toBe(pakistanZone);
      expect((await resolveShippingZone("PK", "Hyderabad"))?.id).toBe(ids.karachiZone);
    });

    it("the fallback zone can't be deactivated through the form, the quick action, or a delete", async () => {
      const viaForm = await actions.updateZoneAction(null, form(zoneFields({ id: ids.internationalZone, name: "International", areas: "", isActive: "false", version: await versionOf(ids.internationalZone) })));
      expect(viaForm).toMatchObject({ ok: false, fieldErrors: { isActive: staff.FALLBACK_PROTECTED_MESSAGE } });
      expect(await actions.setZoneActiveAction(null, form({ id: ids.internationalZone, isActive: "false" }))).toEqual({ ok: false, error: staff.FALLBACK_PROTECTED_MESSAGE });
      expect(await actions.deleteZoneAction(null, form({ id: ids.internationalZone }))).toEqual({ ok: false, error: staff.FALLBACK_PROTECTED_MESSAGE });
      expect(await staff.checkZoneDeletable(ids.internationalZone)).toEqual({ allowed: false, reason: "fallback" });
      expect((await zoneById(ids.internationalZone)).isActive).toBe(true);
    });
  });

  describe("delete and deactivate", () => {
    it("a zone with orders can't be deleted (Deactivate offered instead); deactivating it leaves the order untouched and re-routes new addresses", async () => {
      const order = await placeKarachiOrder();
      expect(order.shippingZoneId).toBe(ids.karachiZone);

      expect(await staff.checkZoneDeletable(ids.karachiZone)).toEqual({ allowed: false, reason: "orders", orderCount: 1 });
      const refused = await actions.deleteZoneAction(null, form({ id: ids.karachiZone }));
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toMatch(/1 order was .* Deactivate it instead/);
      expect(await zoneById(ids.karachiZone)).toBeDefined();

      expect(await actions.setZoneActiveAction(null, form({ id: ids.karachiZone, isActive: "false" }))).toEqual({ ok: true });
      expect(await auditRows(ids.karachiZone, "shipping_zone.deactivate")).toHaveLength(1);
      expect((await resolveShippingZone("PK", "Karachi"))?.id).toBe(pakistanZone);
      // The past order keeps its zone and its pending charge.
      const after = (await db.select().from(orders).where(eq(orders.id, order.id)))[0];
      expect(after).toMatchObject({ shippingZoneId: ids.karachiZone, shippingTotal: null, orderStatus: "awaiting_shipping_quote" });
    });

    it("an unused non-fallback zone deletes with its areas, renumbering the rest and auditing", async () => {
      const created = await staff.createZone(zoneFields(), { id: actorId });
      const id = (created as { id: number }).id;
      expect(await staff.checkZoneDeletable(id)).toEqual({ allowed: true });
      await expectRedirectTo(() => actions.deleteZoneAction(null, form({ id })), "/panel/shipping");
      expect(await zoneById(id)).toBeUndefined();
      expect(await areasOf(id)).toEqual([]);
      expect(await auditRows(id, "shipping_zone.delete")).toHaveLength(1);
      expect((await staff.listStaffZones()).map((item) => item.position)).toEqual([1, 2, 3]);
      expect((await resolveShippingZone("PK", "Lahore"))?.id).toBe(pakistanZone);
    });

    it("refuses to deactivate or delete a zone when the real resolver would then leave a checkout destination with no zone", async () => {
      // No fallback at all: only Karachi (PK:karachi) and Pakistan (PK) remain.
      await db.delete(shippingZones).where(eq(shippingZones.id, ids.internationalZone));
      // Pakistan is now the only thing covering "other city" addresses in Pakistan; abroad already has nothing.
      const refused = await actions.setZoneActiveAction(null, form({ id: pakistanZone, isActive: "false" }));
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error).toMatch(/would leave .* with no delivery zone/);
      const deleted = await actions.deleteZoneAction(null, form({ id: pakistanZone }));
      expect(deleted.ok).toBe(false);
      // Karachi alone can go: Pakistan still covers Karachi.
      expect(await actions.setZoneActiveAction(null, form({ id: ids.karachiZone, isActive: "false" }))).toEqual({ ok: true });
      expect((await resolveShippingZone("PK", "Karachi"))?.id).toBe(pakistanZone);
      // And the last active zone can never be switched off.
      const last = await actions.setZoneActiveAction(null, form({ id: pakistanZone, isActive: "false" }));
      expect(last.ok).toBe(false);
      if (!last.ok) expect(last.error).toMatch(/no delivery zone|no active delivery zone/);
    });

    it("repeating the same state is refused as a no-op message, and reactivating writes its own audit row", async () => {
      expect(await actions.setZoneActiveAction(null, form({ id: ids.karachiZone, isActive: "true" }))).toEqual({ ok: false, error: "This zone is already active." });
      await actions.setZoneActiveAction(null, form({ id: ids.karachiZone, isActive: "false" }));
      expect(await actions.setZoneActiveAction(null, form({ id: ids.karachiZone, isActive: "true" }))).toEqual({ ok: true });
      expect(await auditRows(ids.karachiZone, "shipping_zone.activate")).toHaveLength(1);
    });
  });

  describe("sort order", () => {
    it("moves a zone with the MoveToControl fields, audits the before/after order, and changes no resolution", async () => {
      expect(await actions.moveZoneAction(null, form({ id: ids.internationalZone, placement: "top" }))).toEqual({ ok: true });
      expect((await staff.listStaffZones()).map((item) => item.name)).toEqual(["International", "Karachi", "Pakistan"]);
      expect(await actions.moveZoneAction(null, form({ id: ids.internationalZone, placement: "position", position: 3 }))).toEqual({ ok: true });
      expect((await staff.listStaffZones()).map((item) => item.name)).toEqual(["Karachi", "Pakistan", "International"]);
      const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, "shipping_zone.sort_change"));
      expect(rows).toHaveLength(2);
      expect(JSON.parse(rows[0].newValues!)).toEqual({ orderedIds: [ids.internationalZone, ids.karachiZone, pakistanZone] });
      expect((await resolveShippingZone("PK", "Karachi"))?.id).toBe(ids.karachiZone);
      expect(await actions.moveZoneAction(null, form({ id: ids.karachiZone, placement: "position" }))).toMatchObject({ ok: false });
    });
  });

  describe("a flat-rate zone end to end", () => {
    beforeEach(async () => {
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(await karachiFields({ mode: "flat", flatRate: "250", freeOverAmount: "10000" }))), "/panel/shipping");
    });

    it("the checkout quote with a destination prices the charge, the cart (no destination) stays pending, and the order is placed as pending with the charge set", async () => {
      const cart = await quote(2, null);
      expect(cart.delivery).toEqual({ status: "pending" });
      expect(cart.expectedTotal).toBe("2000.00");

      const karachi = await quote(2, { country: "PK", city: "Karachi" });
      expect(karachi.delivery).toEqual({ status: "priced", amount: "PKR 250" });
      expect(karachi.total).toBe("PKR 2,250");
      expect(karachi.expectedTotal).toBe("2250.00");

      // Another Pakistani city stays on the quote-mode Pakistan zone.
      expect((await quote(2, { country: "PK", city: "Lahore" })).delivery).toEqual({ status: "pending" });

      const order = await placeKarachiOrder({ expectedTotal: karachi.expectedTotal });
      expect(order).toMatchObject({ shippingZoneId: ids.karachiZone, shippingTotal: "250.00", total: "2250.00", orderStatus: "pending", paymentStatus: "cod_pending" });
    });

    it("free delivery over the threshold prices to zero, and COD is still offered in Karachi", async () => {
      const big = await quote(10, { country: "PK", city: "Karachi" });
      expect(big.delivery).toEqual({ status: "priced", amount: "PKR 0" });
      expect(big.expectedTotal).toBe("10000.00");
      const order = await placeKarachiOrder({ lines: [{ variantId: ids.plate, quantity: 10 }], expectedTotal: "10000.00", paymentMethod: "cod" });
      expect(order).toMatchObject({ shippingTotal: "0.00", total: "10000.00", orderStatus: "pending" });
    });

    it("a quote taken before the mode switch is refused at Place order, never silently re-priced", async () => {
      // The browser still holds the goods-only total from a quote-mode quote.
      const stale = await checkout.createOrder(checkoutInput(ids, { expectedTotal: "2000.00" }), { ip: nextIp() });
      expect(stale).toEqual({ ok: false, error: checkout.PRICES_CHANGED_MESSAGE });
      expect(await db.select().from(orders)).toHaveLength(0);
    });

    it("switching back to quote never changes the flat order already placed", async () => {
      const order = await placeKarachiOrder({ expectedTotal: "2250.00" });
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(await karachiFields({ mode: "quote" }))), "/panel/shipping");
      const after = (await db.select().from(orders).where(eq(orders.id, order.id)))[0];
      expect(after).toMatchObject({ shippingTotal: "250.00", total: "2250.00", orderStatus: "pending" });
      expect((await quote(2, { country: "PK", city: "Karachi" })).delivery).toEqual({ status: "pending" });
    });
  });

  describe("COD is Pakistan-only whatever the switch says", () => {
    it("refuses a COD order abroad even after the fallback zone's COD switch is turned on, and the tester says why", async () => {
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(zoneFields({ id: ids.internationalZone, name: "International", areas: "", codEnabled: "true", version: await versionOf(ids.internationalZone) }))), "/panel/shipping");
      expect((await zoneById(ids.internationalZone)).codEnabled).toBe(true);

      const abroad = await checkout.createOrder(checkoutInput(ids, { country: "GB", city: "London", paymentMethod: "cod" }), { ip: nextIp() });
      expect(abroad).toEqual({ ok: false, error: checkout.COD_PAKISTAN_ONLY_MESSAGE });

      const tested = await actions.testDestinationAction(null, form({ country: "GB", city: "London" }));
      expect(tested.ok).toBe(true);
      if (tested.ok) {
        expect(tested.outcome.zone?.id).toBe(ids.internationalZone);
        expect(tested.outcome.codAvailable).toBe(false);
        expect(tested.codText).toMatch(/Pakistan-only/);
      }
    });
  });

  describe("test a destination", () => {
    it("resolves Karachi, another Pakistani city and an international country with the real resolver and the checkout's wording", async () => {
      const karachi = await actions.testDestinationAction(null, form({ country: "pk", city: "Karachi", goodsTotal: "" }));
      expect(karachi).toMatchObject({ ok: true, destination: "Karachi, Pakistan", outcome: { zone: { id: ids.karachiZone }, delivery: { kind: "quote" }, codAvailable: true }, codText: "Offered" });
      const lahore = await actions.testDestinationAction(null, form({ country: "PK", city: "Lahore" }));
      expect(lahore).toMatchObject({ ok: true, outcome: { zone: { id: pakistanZone } }, deliveryText: expect.stringContaining("WhatsApp") });
      const abroad = await actions.testDestinationAction(null, form({ country: "GB" }));
      expect(abroad).toMatchObject({ ok: true, destination: "United Kingdom", outcome: { zone: { id: ids.internationalZone }, codAvailable: false } });
      expect(await actions.testDestinationAction(null, form({ country: "XX" }))).toMatchObject({ ok: false });
    });

    it("reports a flat charge, then free delivery once the goods total meets the threshold", async () => {
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(await karachiFields({ mode: "flat", flatRate: "250", freeOverAmount: "10000" }))), "/panel/shipping");
      const small = await actions.testDestinationAction(null, form({ country: "PK", city: "Karachi", goodsTotal: "2000" }));
      expect(small).toMatchObject({ ok: true, outcome: { delivery: { kind: "flat", amount: 25_000 } }, deliveryText: "Flat delivery charge of PKR 250" });
      const large = await actions.testDestinationAction(null, form({ country: "PK", city: "Karachi", goodsTotal: "10000" }));
      expect(large).toMatchObject({ ok: true, outcome: { delivery: { kind: "free" } } });
    });
  });

  describe("RBAC", () => {
    it("the Developer opens the page; the Admin is refused on the page and every action", async () => {
      await expect(ShippingPage()).resolves.toBeDefined();
      await signInAs(ADMIN_DEFAULT_PERMISSIONS);
      await expectRedirectTo(() => ShippingPage(), "/panel/403");
      await expectRedirectTo(() => actions.createZoneAction(null, form(zoneFields())), "/panel/403");
      await expectRedirectTo(async () => actions.updateZoneAction(null, form(zoneFields({ id: ids.karachiZone }))), "/panel/403");
      await expectRedirectTo(() => actions.setZoneActiveAction(null, form({ id: ids.karachiZone, isActive: "false" })), "/panel/403");
      await expectRedirectTo(() => actions.deleteZoneAction(null, form({ id: ids.karachiZone })), "/panel/403");
      await expectRedirectTo(() => actions.moveZoneAction(null, form({ id: ids.karachiZone, placement: "top" })), "/panel/403");
      await expectRedirectTo(() => actions.testDestinationAction(null, form({ country: "PK", city: "Karachi" })), "/panel/403");
    });

    it("a session holding only product.* or only discount.manage is refused everywhere, and no session goes to login", async () => {
      for (const keys of [[PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.PRODUCT_UPDATE], [PERMISSIONS.DISCOUNT_MANAGE]]) {
        await signInAs(keys);
        await expectRedirectTo(() => ShippingPage(), "/panel/403");
        await expectRedirectTo(() => actions.createZoneAction(null, form(zoneFields())), "/panel/403");
        await expectRedirectTo(() => actions.testDestinationAction(null, form({ country: "PK" })), "/panel/403");
      }
      current.cookies.clear();
      await expectRedirectTo(() => ShippingPage(), "/panel/login");
      await expectRedirectTo(() => actions.createZoneAction(null, form(zoneFields())), "/panel/login");
    });
  });
});
