/**
 * Customer and owner order emails against the test database (BUILD_PLAN.md S21 Phase 2):
 * `@/server/mail/transport` is mocked throughout. Skips without TEST_DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@/features/auth/permissions";
import { auditLogs } from "@/server/db/schema/audit";
import { settings } from "@/server/db/schema/settings";
import { assertTestDatabase, checkoutInput, createStaffSession, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("@/server/mail/transport", () => ({ sendMail }));
// Nothing in this suite subscribes to push; stub it out so the shared `sendEvent` path never
// makes a real network call while still exercising the owner-email channel it also drives.
vi.mock("@/server/notify/push", () => ({ sendPush: vi.fn().mockResolvedValue({ ok: true }) }));
// S22 BUG-15: the reads that build an email can fail too; the settings reader stands in for "the database dropped".
const getContactInfo = vi.hoisted(() => vi.fn());
vi.mock("@/features/settings/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/settings/service")>();
  getContactInfo.mockImplementation(actual.getContactInfo);
  return { ...actual, getContactInfo };
});

type Db = typeof import("@/server/db/client");
type StaffActions = typeof import("@/features/orders/staff-actions");

describe.skipIf(!TEST_DATABASE_URL)("order emails (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let mail: typeof import("./service");
  let notifyNewOrder: typeof import("@/features/notify/service").notifyNewOrder;
  let staff: StaffActions;

  let ids: FixtureIds;
  let ipCounter = 0;
  const nextIp = () => `mail-ip-${++ipCounter}`;

  const notifyFailures = () => db.select().from(auditLogs).where(eq(auditLogs.action, "notify.failed"));

  async function placeOrder(overrides: Record<string, unknown> = {}) {
    const placed = await createOrder(checkoutInput(ids, overrides), { ip: nextIp() });
    if (!placed.ok) throw new Error(placed.error);
    return placed.orderNumber;
  }

  beforeAll(async () => {
    assertTestDatabase();
    ({ db, pool } = await import("@/server/db/client"));
    ({ createOrder } = await import("@/features/checkout/service"));
    mail = await import("./service");
    ({ notifyNewOrder } = await import("@/features/notify/service"));
    staff = await import("@/features/orders/staff-actions");
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    sendMail.mockReset();
    sendMail.mockResolvedValue(undefined);
    await resetTables(db);
    ids = await seedFixtures(db);
  });

  it("sends the order-received email when the order has one", async () => {
    const orderNumber = await placeOrder({ email: "customer@example.com" });
    await mail.sendOrderReceivedEmail(orderNumber);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [message] = sendMail.mock.calls[0];
    expect(message.to).toBe("customer@example.com");
    expect(message.subject).toContain(orderNumber);
  });

  it("attempts no email at all when the order has none", async () => {
    const orderNumber = await placeOrder({ email: "" });
    await mail.sendOrderReceivedEmail(orderNumber);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("never fails the triggering action when the transport throws, and logs it instead", async () => {
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    const orderNumber = await placeOrder({ email: "customer@example.com" });

    await expect(mail.sendOrderReceivedEmail(orderNumber)).resolves.toBeUndefined();

    const failures = await notifyFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].entityId).toBe(orderNumber);
    expect(JSON.parse(failures[0].newValues!)).toEqual({ channel: "mail", reason: "smtp down" });
  });

  it("records notify.failed when a read inside the sender fails, instead of rejecting the after() task", async () => {
    const orderNumber = await placeOrder({ email: "customer@example.com" });
    getContactInfo.mockRejectedValueOnce(new Error("database went away"));
    await expect(mail.sendOrderReceivedEmail(orderNumber)).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
    const failures = await notifyFailures();
    expect(failures).toHaveLength(1);
    expect(JSON.parse(failures[0].newValues!)).toMatchObject({ channel: "mail", reason: "database went away" });
  });

  it("sends no owner order email by default (the setting is off)", async () => {
    const orderNumber = await placeOrder({ paymentMethod: "cod" });
    await notifyNewOrder(orderNumber, "cod");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("emails the configured owner recipients once notify_owner_order_emails is set, with no personal data", async () => {
    await db
      .insert(settings)
      .values({ key: "notify_owner_order_emails", value: JSON.stringify(["owner@rshome.local", "second@rshome.local"]) })
      .onDuplicateKeyUpdate({ set: { value: JSON.stringify(["owner@rshome.local", "second@rshome.local"]) } });

    const orderNumber = await placeOrder({ paymentMethod: "cod", name: "Ali Khan", phone: "0300 1234567" });
    await notifyNewOrder(orderNumber, "cod");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [message] = sendMail.mock.calls[0];
    expect(message.to).toBe("owner@rshome.local,second@rshome.local");
    expect(message.text).toContain(orderNumber);
    expect(message.text.toLowerCase()).not.toContain("ali khan");
    expect(message.text).not.toContain("0300");
  });

  it("never fails the staff action itself when the approved-order email transport throws", async () => {
    const orderNumber = await placeOrder({ email: "customer@example.com", paymentMethod: "cod" });
    const { hashToken } = await import("@/server/auth/session");
    const { userId } = await createStaffSession(db, hashToken, [PERMISSIONS.ORDER_SET_SHIPPING]);

    const approval = await staff.approveOrder({ orderNumber, amount: "450", note: "" }, { id: userId });
    expect(approval).toEqual({ ok: true });

    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    await expect(mail.sendOrderApprovedEmail(orderNumber)).resolves.toBeUndefined();

    const failures = await notifyFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].entityId).toBe(orderNumber);
  });
});
