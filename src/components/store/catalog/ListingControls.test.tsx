// @vitest-environment jsdom
/**
 * S22 BUG-18: the shop search form carries the chosen sort along as a hidden field — it used to
 * compare against "newest" instead of the real default ("recommended"), so a search made while
 * sorted by Newest silently fell back to the default order.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchForm } from "./ListingControls";

vi.mock("next/form", () => ({ default: (props: React.ComponentProps<"form">) => <form {...props} /> }));

afterEach(cleanup);

const state = { q: "", category: undefined, sort: "newest" as const, page: 1 };

describe("SearchForm", () => {
  it("keeps a chosen Newest sort when searching", () => {
    const { container } = render(<SearchForm basePath="/shop" state={state} />);
    expect(container.querySelector('input[name="sort"]')).toHaveValue("newest");
  });

  it("leaves the default Recommended sort out of the URL", () => {
    const { container } = render(<SearchForm basePath="/shop" state={{ ...state, sort: "recommended" }} />);
    expect(container.querySelector('input[name="sort"]')).toBeNull();
  });
});
