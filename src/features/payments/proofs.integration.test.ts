/**
 * The payment screenshot routes against the test database (ARCHITECTURE.md §4.4, §8): the checkout
 * upload, the order-page upload and staff serving. The Route Handlers are called directly with a
 * real Request; `next/headers` is replaced by the request state below, since there is no Next
 * server around them. Skips without TEST_DATABASE_URL.
 */
import { randomBytes } from "node:crypto";
import { readFile, readdir, rm, utimes, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { permissions, rateLimits, rolePermissions, roles, sessions, users } from "@/server/db/schema/access-control";
import { orderStatusHistory, orders, paymentProofs } from "@/server/db/schema/orders";
import { assertTestDatabase, checkoutInput, resetTables, seedFixtures, type FixtureIds } from "@/test/integration-fixtures";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

/** What `cookies()` and `headers()` return for the request under test. */
const current = vi.hoisted(() => ({ cookies: new Map<string, string>(), headers: new Headers() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (current.cookies.has(name) ? { name, value: current.cookies.get(name) } : undefined),
  }),
  headers: async () => current.headers,
}));

type Db = typeof import("@/server/db/client");

describe.skipIf(!TEST_DATABASE_URL)("payment screenshots (integration)", () => {
  let db: Db["db"];
  let pool: Db["pool"];
  let env: typeof import("@/server/env").env;
  let createOrder: typeof import("@/features/checkout/service").createOrder;
  let decodeProofToken: typeof import("./proof-token").decodeProofToken;
  let encodeOrderAccess: typeof import("@/features/checkout/order-access").encodeOrderAccess;
  let hashToken: typeof import("@/server/auth/session").hashToken;
  let checkoutUpload: (typeof import("@/app/api/checkout/proof/route"))["POST"];
  let orderUpload: (typeof import("@/app/api/orders/[orderNumber]/proofs/route"))["POST"];
  let serveProof: (typeof import("@/app/api/files/proof/[id]/route"))["GET"];

  let ids: FixtureIds;
  let ipCounter = 0;
  const nextIp = () => `proof-ip-${++ipCounter}`;

  const png = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: "#d8c8a8" } })
      .png()
      .toBuffer();

  /** A multipart POST as the browser sends it, with its real Content-Length (or a stated one). */
  async function uploadRequest(url: string, file: Blob | null, options: { origin?: string | null; ip?: string } = {}) {
    const form = new FormData();
    if (file) form.append("file", file, "transfer.jpg");
    const encoded = new Response(form);
    const body = await encoded.blob();
    const headers = new Headers({ "content-type": encoded.headers.get("content-type")!, "content-length": String(body.size) });
    const origin = options.origin === undefined ? ORIGIN : options.origin;
    if (origin) headers.set("origin", origin);
    current.headers = new Headers({ "x-forwarded-for": options.ip ?? nextIp() });
    return new Request(url, { method: "POST", body, headers });
  }

  const json = async (response: Response) => ({ status: response.status, body: await response.json() });
  const imageFile = (bytes: Buffer, type = "image/jpeg") => new Blob([new Uint8Array(bytes)], { type });

  async function uploadAtCheckout(file: Blob, options: { origin?: string | null; ip?: string } = {}) {
    return json(await checkoutUpload(await uploadRequest(`${ORIGIN}/api/checkout/proof`, file, options)));
  }

  async function uploadToOrder(orderNumber: string, purpose: string, file: Blob) {
    const request = await uploadRequest(`${ORIGIN}/api/orders/${orderNumber}/proofs?purpose=${purpose}`, file);
    return json(await orderUpload(request, { params: Promise.resolve({ orderNumber }) }));
  }

  const pendingFile = (token: string) => path.join(env.UPLOAD_DIR, "proofs", "pending", `${decodeProofToken(token, env.SESSION_SECRET, new Date())}.webp`);

  async function placeBankOrder(): Promise<{ id: number; orderNumber: string }> {
    const upload = await uploadAtCheckout(imageFile(await png(800, 1600), "image/png"));
    const placed = await createOrder(checkoutInput(ids, { paymentMethod: "bank_transfer", proofToken: upload.body.token }), { ip: nextIp() });
    if (!placed.ok) throw new Error(placed.error);
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, placed.orderNumber));
    return { id: order.id, orderNumber: order.orderNumber };
  }

  const grantAccess = (orderNumber: string) =>
    current.cookies.set("order_access", encodeOrderAccess([orderNumber], new Date(Date.now() + 60_000), env.SESSION_SECRET));

  /** What S9's "set delivery charge" will do; S8 only needs the order to be in that state. */
  const setDeliveryCharge = (orderId: number, paymentStatus: "proof_submitted" | "unpaid" = "proof_submitted") =>
    db.update(orders).set({ orderStatus: "pending", shippingTotal: "450.00", total: "2450.00", paymentStatus }).where(eq(orders.id, orderId));

  const proofsOf = (orderId: number) => db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId)).orderBy(paymentProofs.id);

  beforeAll(async () => {
    const [client, envModule, checkout, token, access, session, checkoutRoute, orderRoute, fileRoute] = await Promise.all([
      import("@/server/db/client"),
      import("@/server/env"),
      import("@/features/checkout/service"),
      import("./proof-token"),
      import("@/features/checkout/order-access"),
      import("@/server/auth/session"),
      import("@/app/api/checkout/proof/route"),
      import("@/app/api/orders/[orderNumber]/proofs/route"),
      import("@/app/api/files/proof/[id]/route"),
    ]);
    db = client.db;
    pool = client.pool;
    env = envModule.env;
    createOrder = checkout.createOrder;
    decodeProofToken = token.decodeProofToken;
    encodeOrderAccess = access.encodeOrderAccess;
    hashToken = session.hashToken;
    checkoutUpload = checkoutRoute.POST;
    orderUpload = orderRoute.POST;
    serveProof = fileRoute.GET;

    assertTestDatabase();
    await rm(path.join(env.UPLOAD_DIR, "proofs"), { recursive: true, force: true });
    await resetTables(db);
    ids = await seedFixtures(db);
  });

  beforeEach(async () => {
    await db.delete(rateLimits);
    current.cookies.clear();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("checkout upload (POST /api/checkout/proof)", () => {
    it("re-encodes a photo: orientation applied, longest side 2000 px, WebP with no EXIF, stored outside the app folder", async () => {
      // 3000×1500 pixels shot sideways (EXIF orientation 6): it displays as 1500×3000.
      const photo = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#704214" } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .withExif({ IFD0: { Copyright: "customer secret", Artist: "Test Customer" } })
        .toBuffer();
      expect((await sharp(photo).metadata()).exif).toBeDefined();

      const result = await uploadAtCheckout(imageFile(photo));
      expect(result.status).toBe(201);
      const stored = pendingFile(result.body.token);

      const metadata = await sharp(await readFile(stored)).metadata();
      expect(metadata).toMatchObject({ format: "webp", width: 1000, height: 2000 });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
      expect(path.relative(process.cwd(), stored).startsWith("..")).toBe(true);
    });

    it("rejects a renamed .exe from its bytes, whatever the name and type claim", async () => {
      const exe = Buffer.concat([Buffer.from("MZ"), randomBytes(4096)]);
      expect(await uploadAtCheckout(imageFile(exe, "image/jpeg"))).toEqual({ status: 415, body: { error: "Please choose a JPG, PNG or WebP image." } });
    });

    it("rejects a 6 MB body from its Content-Length, and a file over 5 MB inside a smaller body", async () => {
      const tooLarge = { error: "This image is larger than 5 MB. Please choose a smaller one." };
      expect(await uploadAtCheckout(imageFile(randomBytes(6 * 1024 * 1024)))).toEqual({ status: 413, body: tooLarge });
      expect(await uploadAtCheckout(imageFile(randomBytes(5 * 1024 * 1024 + 200 * 1024)))).toEqual({ status: 413, body: tooLarge });
    });

    it("rejects a huge-pixel image before decoding it", async () => {
      const bomb = await png(6000, 6000);
      expect(bomb.length).toBeLessThan(1024 * 1024);
      expect(await uploadAtCheckout(imageFile(bomb, "image/png"))).toEqual({
        status: 422,
        body: { error: "This image is too large. Please upload a screenshot of the transfer instead." },
      });
    });

    it("refuses another site's request, and one with no Origin at all", async () => {
      const file = imageFile(await png(100, 100), "image/png");
      expect((await uploadAtCheckout(file, { origin: "https://evil.example" })).status).toBe(403);
      expect((await uploadAtCheckout(file, { origin: null })).status).toBe(403);
    });

    it("rate-limits uploads per IP", async () => {
      const file = imageFile(await png(100, 100), "image/png");
      for (let attempt = 0; attempt < 10; attempt += 1) expect((await uploadAtCheckout(file, { ip: "busy-ip" })).status).toBe(201);
      expect(await uploadAtCheckout(file, { ip: "busy-ip" })).toEqual({
        status: 429,
        body: { error: "Too many uploads. Please try again in a few minutes." },
      });
    });

    it("sweeps pending uploads older than a day on the next upload", async () => {
      const pendingDir = path.join(env.UPLOAD_DIR, "proofs", "pending");
      await mkdir(pendingDir, { recursive: true });
      const stale = path.join(pendingDir, `${"a".repeat(32)}.webp`);
      await writeFile(stale, "abandoned checkout");
      const dayAndAHourAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await utimes(stale, dayAndAHourAgo, dayAndAHourAgo);

      const result = await uploadAtCheckout(imageFile(await png(100, 100), "image/png"));
      const remaining = await readdir(pendingDir);
      expect(remaining).not.toContain(path.basename(stale));
      expect(remaining).toContain(path.basename(pendingFile(result.body.token)));
    });
  });

  describe("order-page upload (POST /api/orders/[orderNumber]/proofs)", () => {
    const screenshot = async () => imageFile(await png(700, 1400), "image/png");

    it("needs the order-access cookie", async () => {
      const order = await placeBankOrder();
      expect(await uploadToOrder(order.orderNumber, "delivery", await screenshot())).toEqual({
        status: 403,
        body: { error: "Please open your order from the tracking page first." },
      });
    });

    it("refuses the delivery charge screenshot until staff have set the charge, then takes it", async () => {
      const order = await placeBankOrder();
      grantAccess(order.orderNumber);
      expect(await uploadToOrder(order.orderNumber, "delivery", await screenshot())).toEqual({
        status: 409,
        body: { error: "You can upload the delivery charge screenshot once we have confirmed the charge on WhatsApp." },
      });

      await setDeliveryCharge(order.id);
      expect(await uploadToOrder(order.orderNumber, "delivery", await screenshot())).toEqual({ status: 201, body: { ok: true } });
      expect((await proofsOf(order.id)).map((proof) => [proof.purpose, proof.status])).toEqual([
        ["goods", "submitted"],
        ["delivery", "submitted"],
      ]);
      // Already under review: nothing more to upload until staff review it.
      expect((await uploadToOrder(order.orderNumber, "delivery", await screenshot())).status).toBe(409);

      const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
      expect(history.at(-1)).toMatchObject({ kind: "note", note: "Delivery charge screenshot uploaded" });
    });

    it("moves an order whose delivery charge is due back to proof_submitted", async () => {
      const order = await placeBankOrder();
      grantAccess(order.orderNumber);
      await db.update(paymentProofs).set({ status: "verified" }).where(eq(paymentProofs.orderId, order.id));
      await setDeliveryCharge(order.id, "unpaid");

      expect((await uploadToOrder(order.orderNumber, "delivery", await screenshot())).status).toBe(201);
      const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
      expect(row.paymentStatus).toBe("proof_submitted");
      const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
      expect(history.at(-1)).toMatchObject({ kind: "payment", fromStatus: "unpaid", toStatus: "proof_submitted" });
    });

    it("refuses a new upload once the order is rejected (owner decision, S9: rejecting a screenshot rejects the order)", async () => {
      const order = await placeBankOrder();
      grantAccess(order.orderNumber);
      await db.update(paymentProofs).set({ status: "rejected", rejectionReason: "Amount does not match" }).where(eq(paymentProofs.orderId, order.id));
      await db.update(orders).set({ orderStatus: "rejected", paymentStatus: "rejected", rejectionReason: "Amount does not match" }).where(eq(orders.id, order.id));

      expect(await uploadToOrder(order.orderNumber, "goods", await screenshot())).toEqual({
        status: 409,
        body: { error: "This order doesn't need a payment screenshot right now." },
      });
      expect(await proofsOf(order.id)).toHaveLength(1);
    });

    it("refuses more than 5 screenshots on one order (PAY-06)", async () => {
      const order = await placeBankOrder();
      grantAccess(order.orderNumber);
      // A rejection now closes the order before a second screenshot could ever be due (owner
      // decision, S9), so this pads the count directly to exercise the cap on its own.
      for (let extra = 0; extra < 4; extra += 1) {
        await db.insert(paymentProofs).values({ orderId: order.id, purpose: "goods", status: "verified", filePath: `proofs/test/${extra}.webp`, fileSize: 1 });
      }
      await setDeliveryCharge(order.id, "unpaid");
      await db.delete(rateLimits);
      expect(await proofsOf(order.id)).toHaveLength(5);
      expect(await uploadToOrder(order.orderNumber, "delivery", await screenshot())).toEqual({
        status: 409,
        body: { error: "This order already has the most screenshots we accept. Please message us on WhatsApp." },
      });
    });

    it("refuses a COD order", async () => {
      const placed = await createOrder(checkoutInput(ids), { ip: nextIp() });
      if (!placed.ok) throw new Error(placed.error);
      grantAccess(placed.orderNumber);
      expect((await uploadToOrder(placed.orderNumber, "goods", await screenshot())).status).toBe(409);
    });
  });

  describe("serving (GET /api/files/proof/[id])", () => {
    let proofId = 0;

    async function signIn(permissionKeys: string[]): Promise<void> {
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
      current.cookies.set("panel_session", token);
    }

    const get = (id: string | number) => serveProof(new Request(`${ORIGIN}/api/files/proof/${id}`), { params: Promise.resolve({ id: String(id) }) });

    beforeAll(async () => {
      const order = await placeBankOrder();
      proofId = (await proofsOf(order.id))[0].id;
    });

    it("answers 401 without a panel session", async () => {
      expect((await get(proofId)).status).toBe(401);
    });

    it("answers 403 for staff without order.view or order.verify_payment", async () => {
      await signIn(["product.view"]);
      expect((await get(proofId)).status).toBe(403);
    });

    it("streams the WebP privately to staff with order.view, and 404s an unknown id", async () => {
      await signIn(["order.view"]);
      const response = await get(proofId);
      expect(response.status).toBe(200);
      expect(Object.fromEntries(response.headers)).toMatchObject({
        "content-type": "image/webp",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      });
      expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe("webp");

      expect((await get(proofId + 1000)).status).toBe(404);
      expect((await get("../../etc/passwd")).status).toBe(404);
    });
  });
});
