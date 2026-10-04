import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/config/site.config";
import { getSettingRows } from "@/features/settings/repo";
import { SETTING_KEYS, getAnnouncementText, getContactInfo, getStoreIdentity } from "./service";

vi.mock("@/features/settings/repo", () => ({ getSettingRows: vi.fn() }));
const rows = vi.mocked(getSettingRows);

/**
 * The storefront readers share one `settings` query per request (S22 SPD-02) instead of one per
 * key. Outside a Next request React's `cache()` is a pass-through, so each reader call here
 * reaches the repo once — what's checked is that a reader asks for every key in one query.
 */
describe("settings readers", () => {
  beforeEach(() => rows.mockReset());

  it("loads every setting key with one query, not one query per key", async () => {
    rows.mockResolvedValue([{ key: SETTING_KEYS.storeIdentity, value: JSON.stringify({ storeName: "Test Store", logoText: "TS" }), updatedAt: new Date() }]);
    await expect(getStoreIdentity()).resolves.toEqual({ storeName: "Test Store", logoText: "TS" });
    expect(rows).toHaveBeenCalledTimes(1);
    expect([...rows.mock.calls[0][0]].sort()).toEqual(Object.values(SETTING_KEYS).sort());
  });

  it("falls back per key: a missing row and an unreadable one each fall back on their own", async () => {
    rows.mockResolvedValue([
      { key: SETTING_KEYS.announcementText, value: JSON.stringify("Free delivery this week"), updatedAt: new Date() },
      { key: SETTING_KEYS.contact, value: "{not json", updatedAt: new Date() },
    ]);
    await expect(getAnnouncementText()).resolves.toBe("Free delivery this week");
    await expect(getContactInfo()).resolves.toEqual(siteConfig.contact);
    await expect(getStoreIdentity()).resolves.toEqual({ storeName: siteConfig.storeName, logoText: siteConfig.logoText });
  });
});
