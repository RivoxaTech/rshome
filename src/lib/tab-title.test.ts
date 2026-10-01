import { describe, expect, it } from "vitest";
import { ordersTabTitle } from "./tab-title";

describe("ordersTabTitle", () => {
  it("is null at zero, meaning: restore the page's own title", () => {
    expect(ordersTabTitle(0)).toBeNull();
  });

  it("singularises one", () => {
    expect(ordersTabTitle(1)).toBe("(1) Order");
  });

  it("pluralises more than one", () => {
    expect(ordersTabTitle(2)).toBe("(2) Orders");
    expect(ordersTabTitle(12)).toBe("(12) Orders");
  });
});
