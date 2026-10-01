/**
 * Dev-only demo wholesale inquiries for manual QA of the panel (S17). Two modes:
 *
 *   npm run db:reset:wholesale   deletes every inquiry and everything hanging off it (notes,
 *                                items), its audit_logs rows, and clears the wholesale rate limit.
 *   npm run db:seed:wholesale    places 7 realistic inquiries through the real service
 *                                (createWholesaleInquiry — one with 12 item rows, to check the
 *                                detail page's layout doesn't grow a gap as items grow), then
 *                                moves a few on to contacted/closed and adds a staff note through
 *                                the real actions, so status, history and audit rows are all
 *                                correct. `-- --many` adds 40 extra inquiries for pagination
 *                                testing.
 *
 * Refuses to run against anything but the "rs_home" database (never "rs_home_test" or a host DB).
 */
import "../src/server/load-env";
import { eq, like } from "drizzle-orm";
import { normalizePhone } from "../src/lib/phone";
import { addWholesaleNote, changeWholesaleStatus } from "../src/features/wholesale/staff-actions";
import { createWholesaleInquiry } from "../src/features/wholesale/service";
import { db, pool } from "../src/server/db/client";
import { rateLimits, roles, users } from "../src/server/db/schema/access-control";
import { auditLogs } from "../src/server/db/schema/audit";
import { wholesaleInquiries, wholesaleInquiryItems, wholesaleInquiryNotes } from "../src/server/db/schema/wholesale";
import { env } from "../src/server/env";

function assertDevDatabase(): void {
  const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
  if (databaseName !== "rs_home") {
    throw new Error(`Refusing to run against database "${databaseName}" — this script only runs against "rs_home", never a *_test or host database.`);
  }
}

// ── Reset ───────────────────────────────────────────────────────────────────────────────────

async function resetWholesale(): Promise<void> {
  const [notesResult] = await db.delete(wholesaleInquiryNotes);
  const [itemsResult] = await db.delete(wholesaleInquiryItems);
  const [inquiriesResult] = await db.delete(wholesaleInquiries);
  const [auditResult] = await db.delete(auditLogs).where(eq(auditLogs.entity, "wholesale_inquiry"));
  const [rateLimitResult] = await db.delete(rateLimits).where(like(rateLimits.bucket, "wholesale:ip:%"));

  console.log("Reset complete:");
  console.log(`  inquiries deleted: ${inquiriesResult.affectedRows}`);
  console.log(`  inquiry items deleted: ${itemsResult.affectedRows}`);
  console.log(`  inquiry notes deleted: ${notesResult.affectedRows}`);
  console.log(`  audit log rows deleted (wholesale_inquiry): ${auditResult.affectedRows}`);
  console.log(`  wholesale rate limit buckets cleared: ${rateLimitResult.affectedRows}`);
}

// ── Seed ────────────────────────────────────────────────────────────────────────────────────

let ipCounter = 0;
const nextIp = () => `demo-seed-wholesale-${++ipCounter}`;

type DemoInquiry = {
  name: string;
  business?: string;
  businessType: "retail" | "restaurant_cafe" | "hotel" | "event" | "other";
  phone: string;
  email?: string;
  city: string;
  neededByDate?: string;
  items: { itemName: string; quantity: string; note?: string }[];
  message: string;
  moveTo?: "contacted" | "closed";
  note?: string;
};

const DEMO_INQUIRIES: DemoInquiry[] = [
  {
    name: "Sana Tariq",
    business: "Clifton Events Co.",
    businessType: "event",
    phone: "0321 1234567",
    email: "sana@cliftonevents.pk",
    city: "Karachi",
    neededByDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21).toISOString().slice(0, 10),
    items: [
      { itemName: "Dinner plates", quantity: "150", note: "matte white" },
      { itemName: "Tea sets", quantity: "20" },
    ],
    message: "Wedding reception for 150 guests, need a cohesive tableware set.",
  },
  {
    name: "Bilal Ahmed",
    businessType: "other",
    phone: "0300 2233445",
    city: "Lahore",
    items: [{ itemName: "Decor trays", quantity: "30" }],
    message: "Looking for a bulk price on your decor trays for resale.",
  },
  {
    name: "Hassan Raza",
    business: "The Teahouse",
    businessType: "restaurant_cafe",
    phone: "0333 4455667",
    email: "hassan@theteahouse.pk",
    city: "Islamabad",
    items: [{ itemName: "Tea sets", quantity: "40", note: "house blend branding not needed" }],
    message: "Opening a second branch next month, restocking tea sets.",
    moveTo: "contacted",
    note: "Called — sending a quote for 40 sets by Friday.",
  },
  {
    name: "Ayesha Khan",
    business: "Khan Hospitality Group",
    businessType: "hotel",
    phone: "0345 5566778",
    email: "procurement@khanhospitality.pk",
    city: "Karachi",
    neededByDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString().slice(0, 10),
    items: [
      { itemName: "Dinner plates", quantity: "300" },
      { itemName: "Side plates", quantity: "300" },
      { itemName: "Trays", quantity: "60" },
    ],
    message: "Refurbishing our banquet hall's tableware, need a full set.",
  },
  {
    name: "Usman Farooq",
    businessType: "retail",
    phone: "0312 6677889",
    city: "Faisalabad",
    items: [{ itemName: "Decor pieces", quantity: "25" }],
    message: "Interested in reselling your decor range in our store.",
    moveTo: "closed",
    note: "Minimum order quantity didn't work for them — closing for now.",
  },
  {
    name: "Zainab Sheikh",
    business: "Sheikh Catering",
    businessType: "restaurant_cafe",
    phone: "0300 7788990",
    email: "zainab@sheikhcatering.pk",
    city: "Rawalpindi",
    items: [{ itemName: "Serving trays", quantity: "50", note: "stackable" }],
    message: "Catering business expansion, need serving trays in bulk.",
    moveTo: "contacted",
    note: "Sent our wholesale catalogue, awaiting their order size.",
  },
  {
    // Many item rows (S17 follow-up): the detail page's Inquiry/Items column should grow freely
    // without opening a gap between the Contact and Activity cards in the right column.
    name: "Faisal Mahmood",
    business: "Mahmood Hotels & Resorts",
    businessType: "hotel",
    phone: "0333 9988776",
    email: "procurement@mahmoodhotels.pk",
    city: "Karachi",
    neededByDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString().slice(0, 10),
    items: [
      { itemName: "Dinner plates", quantity: "500" },
      { itemName: "Side plates", quantity: "500" },
      { itemName: "Soup bowls", quantity: "300" },
      { itemName: "Tea cups", quantity: "400" },
      { itemName: "Tea saucers", quantity: "400" },
      { itemName: "Serving trays", quantity: "80", note: "large" },
      { itemName: "Serving trays", quantity: "40", note: "small" },
      { itemName: "Water jugs", quantity: "60" },
      { itemName: "Tea sets", quantity: "25" },
      { itemName: "Decor pieces", quantity: "30", note: "lobby display" },
      { itemName: "Napkin holders", quantity: "100" },
      { itemName: "Serving spoons", quantity: "200" },
    ],
    message: "Full re-fit of our banquet and restaurant tableware across three properties.",
  },
];

/** Places one demo inquiry through the real service, then applies its status move and note, if any. */
async function placeDemoInquiry(demo: DemoInquiry, adminId: number): Promise<number> {
  const result = await createWholesaleInquiry(
    {
      name: demo.name,
      business: demo.business ?? "",
      businessType: demo.businessType,
      phone: demo.phone,
      email: demo.email ?? "",
      city: demo.city,
      neededByDate: demo.neededByDate ?? "",
      items: demo.items.map((item) => ({ itemName: item.itemName, quantity: item.quantity, note: item.note ?? "" })),
      message: demo.message,
      website: "",
    },
    { ip: nextIp() },
  );
  if (!result.ok) throw new Error(`createWholesaleInquiry failed for ${demo.name}: ${result.error}`);

  const normalizedPhone = normalizePhone(demo.phone);
  const [inquiry] = await db.select({ id: wholesaleInquiries.id }).from(wholesaleInquiries).where(eq(wholesaleInquiries.phone, normalizedPhone ?? demo.phone));
  if (!inquiry) throw new Error(`Could not find the inquiry just created for ${demo.name}.`);

  if (demo.moveTo) {
    const changed = await changeWholesaleStatus({ id: inquiry.id, status: demo.moveTo }, { id: adminId });
    if (!changed.ok) throw new Error(`changeWholesaleStatus failed for ${demo.name}: ${changed.error}`);
  }
  if (demo.note) {
    const noted = await addWholesaleNote({ id: inquiry.id, note: demo.note }, { id: adminId });
    if (!noted.ok) throw new Error(`addWholesaleNote failed for ${demo.name}: ${noted.error}`);
  }
  return inquiry.id;
}

const EXTRA_CITIES = ["Karachi", "Lahore", "Islamabad", "Faisalabad", "Rawalpindi", "Multan", "Peshawar", "Quetta"];
const EXTRA_BUSINESS_TYPES: DemoInquiry["businessType"][] = ["retail", "restaurant_cafe", "hotel", "event", "other"];

async function seedWholesale(many: boolean): Promise<void> {
  const [admin] = await db.select({ id: users.id }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(roles.key, "admin")).limit(1);
  if (!admin) throw new Error(`No admin user found. Run "npm run db:seed" first.`);

  const placedIds: number[] = [];
  for (const demo of DEMO_INQUIRIES) placedIds.push(await placeDemoInquiry(demo, admin.id));
  console.log(`Placed ${placedIds.length} demo wholesale inquiries.`);

  if (many) {
    for (let index = 0; index < 40; index += 1) {
      const city = EXTRA_CITIES[index % EXTRA_CITIES.length];
      const id = await placeDemoInquiry(
        {
          name: `Pagination Test Buyer ${index + 1}`,
          businessType: EXTRA_BUSINESS_TYPES[index % EXTRA_BUSINESS_TYPES.length],
          phone: `030${index % 10} ${String(2000000 + index).slice(-7)}`,
          city,
          items: [{ itemName: "Decor pieces", quantity: "10" }],
          message: "Pagination test inquiry.",
        },
        admin.id,
      );
      placedIds.push(id);
    }
    console.log("Placed 40 extra inquiries for pagination.");
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertDevDatabase();
  const mode = process.argv[2];
  const many = process.argv.includes("--many");

  if (mode === "reset") {
    await resetWholesale();
  } else if (mode === "seed") {
    await seedWholesale(many);
  } else {
    throw new Error('Usage: tsx scripts/seed-demo-wholesale.ts <reset|seed> [--many]');
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
