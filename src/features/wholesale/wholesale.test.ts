import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWholesaleCsv, escapeCsvField } from "./csv";
import { todayInKarachi, wholesaleInquiryInputSchema, wholesaleListQuerySchema } from "./schemas";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ayesha Raza",
    business: "Raza Catering",
    businessType: "restaurant_cafe",
    phone: "0301 2345678",
    email: "ayesha@example.com",
    city: "Karachi",
    neededByDate: "",
    items: [{ itemName: "Dinner plates", quantity: "50", note: "" }],
    message: "Need these for a wedding.",
    website: "",
    ...overrides,
  };
}

describe("wholesaleInquiryInputSchema", () => {
  it("accepts a valid submission and normalises the phone number", () => {
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phone).toBe("923012345678");
  });

  it("refuses more than 20 item rows", () => {
    const items = Array.from({ length: 21 }, (_, index) => ({ itemName: `Item ${index}`, quantity: "1", note: "" }));
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ items }));
    expect(parsed.success).toBe(false);
  });

  it("requires at least one item row", () => {
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ items: [] }));
    expect(parsed.success).toBe(false);
  });

  it("refuses a needed-by date in the past", () => {
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: "2000-01-01" }));
    expect(parsed.success).toBe(false);
  });

  it("accepts a needed-by date today or later", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: future }));
    expect(parsed.success).toBe(true);
  });

  it("refuses an invalid phone number", () => {
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ phone: "123" }));
    expect(parsed.success).toBe(false);
  });

  it("parses the honeypot field without rejecting the submission", () => {
    // The service (not the schema) treats a filled honeypot as spam — the schema just lets it through.
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ website: "https://spam.example" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.website).toBe("https://spam.example");
  });

  it("stores an empty message as an empty string, not null", () => {
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ message: undefined }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.message).toBe("");
  });
});

describe("neededByDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // S22 BUG-20: Date.parse rolled "2099-02-30" over to 2 March; a calendar check refuses it.
  it("refuses an impossible calendar date", () => {
    for (const bad of ["2099-02-30", "2099-04-31", "2099-13-01"]) {
      const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: bad }));
      expect(parsed.success, bad).toBe(false);
    }
  });

  it("accepts today in Karachi", () => {
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: todayInKarachi() }));
    expect(parsed.success).toBe(true);
  });

  it("refuses yesterday", () => {
    const [year, month, day] = todayInKarachi().split("-").map(Number);
    const yesterday = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: yesterday }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe("Choose a date that hasn't already passed.");
  });

  it("accepts a date years in the future (2029)", () => {
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: "2029-10-27" }));
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty value (the field is optional)", () => {
    const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: "" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.neededByDate).toBeNull();
  });

  it("refuses a half-typed or malformed date with a clear message", () => {
    for (const bad of ["2029-13-45", "2029-1-1", "not-a-date", "2029/10/27", "20291027"]) {
      const parsed = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: bad }));
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe("Enter a valid date.");
    }
  });

  it("uses Karachi's calendar date at the UTC day boundary, not UTC's", () => {
    // 22:00 UTC is already 03:00 the next day in Karachi (UTC+5): Karachi's "today" is one day
    // ahead of UTC's. A date that is still "today" in UTC terms but already passed in Karachi
    // must be refused; the day that is actually "today" in Karachi must be accepted.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T22:00:00Z"));

    const utcToday = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: "2026-10-01" }));
    expect(utcToday.success).toBe(false);

    const karachiToday = wholesaleInquiryInputSchema.safeParse(validInput({ neededByDate: "2026-10-02" }));
    expect(karachiToday.success).toBe(true);
  });
});

describe("wholesaleListQuerySchema", () => {
  it("defaults a missing or unknown tab to all", () => {
    expect(wholesaleListQuerySchema.parse({}).tab).toBe("all");
    expect(wholesaleListQuerySchema.parse({ tab: "bogus" }).tab).toBe("all");
  });

  it("accepts a real status as the tab", () => {
    expect(wholesaleListQuerySchema.parse({ tab: "contacted" }).tab).toBe("contacted");
  });

  it("defaults an invalid page size to 25", () => {
    expect(wholesaleListQuerySchema.parse({ pageSize: "999" }).pageSize).toBe(25);
    expect(wholesaleListQuerySchema.parse({ pageSize: "50" }).pageSize).toBe(50);
  });

  it("defaults a missing or invalid page to 1", () => {
    expect(wholesaleListQuerySchema.parse({}).page).toBe(1);
    expect(wholesaleListQuerySchema.parse({ page: "-5" }).page).toBe(1);
  });
});

describe("escapeCsvField", () => {
  it("quotes a field containing a comma", () => {
    expect(escapeCsvField("Karachi, Pakistan")).toBe('"Karachi, Pakistan"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvField('12" plates')).toBe('"12"" plates"');
  });

  it("quotes a field containing a newline", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("prefixes a formula-looking value with an apostrophe", () => {
    expect(escapeCsvField("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeCsvField("+1234")).toBe("'+1234");
    expect(escapeCsvField("-1234")).toBe("'-1234");
    expect(escapeCsvField("@mention")).toBe("'@mention");
  });

  it("leaves an ordinary value untouched", () => {
    expect(escapeCsvField("Ayesha Raza")).toBe("Ayesha Raza");
  });
});

describe("createWholesaleInquiry (feature flag)", () => {
  it("refuses a submission when features.wholesale is off, before any rate limit or DB write", async () => {
    vi.resetModules();
    vi.doMock("@/config/features", () => ({ features: { wholesale: false } }));
    const { createWholesaleInquiry } = await import("./service");

    const result = await createWholesaleInquiry(validInput(), { ip: "flag-off-test" });
    expect(result).toEqual({ ok: false, error: "Wholesale inquiries aren't available right now." });

    vi.doUnmock("@/config/features");
    vi.resetModules();
  });
});

describe("buildWholesaleCsv", () => {
  it("starts with a UTF-8 BOM and a header row", () => {
    const csv = buildWholesaleCsv([]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("ID,Date,Name");
  });

  it("writes one row per inquiry with CRLF line endings", () => {
    const csv = buildWholesaleCsv([
      {
        id: 1,
        createdAt: "5 Oct 2026",
        name: "Ayesha Raza",
        business: "Raza Catering",
        businessType: "Restaurant / Café",
        phone: "923012345678",
        email: "ayesha@example.com",
        city: "Karachi",
        neededByDate: "",
        status: "New",
        items: "50x Dinner plates (matte)",
        message: "Need these for a wedding.",
      },
    ]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[1]).toContain("Ayesha Raza");
    expect(lines[1]).toContain("50x Dinner plates (matte)");
  });
});
