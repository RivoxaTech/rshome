// @vitest-environment jsdom
/**
 * S22 BUG-08: keystrokes typed while a debounced search navigation is in flight must survive the
 * server's answer (the URL catching up to the earlier value), while a change from elsewhere (the
 * back button) still replaces the field. Real timers: the debounce is 300 ms.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "./SearchBox";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));

const props = { basePath: "/panel/orders/cod", tabSlug: "need-review", pageSize: 25, defaultPageSize: 25 };
const settle = () => new Promise((resolve) => setTimeout(resolve, 450));

describe("SearchBox", () => {
  beforeEach(() => replace.mockClear());
  afterEach(cleanup);

  it("keeps what the user typed while the earlier query's navigation was in flight", async () => {
    const user = userEvent.setup();
    const view = render(<SearchBox initialQ="" {...props} />);
    const input = screen.getByRole("searchbox");

    await user.type(input, "a");
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(replace.mock.calls[0][0]).toContain("q=a");

    // The user keeps typing before the server answers...
    await user.type(input, "b");
    expect(input).toHaveValue("ab");
    // ...then the URL catches up to the first query: the field must not snap back to "a".
    view.rerender(<SearchBox initialQ="a" {...props} />);
    expect(input).toHaveValue("ab");

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(replace.mock.calls[1][0]).toContain("q=ab");
  });

  it("still adopts a query that changed from elsewhere, like the back button", async () => {
    const user = userEvent.setup();
    const view = render(<SearchBox initialQ="" {...props} />);
    const input = screen.getByRole("searchbox");
    await user.type(input, "plate");
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1), { timeout: 2000 });
    view.rerender(<SearchBox initialQ="plate" {...props} />);
    expect(input).toHaveValue("plate");

    view.rerender(<SearchBox initialQ="" {...props} />);
    expect(input).toHaveValue("");
    await settle();
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
