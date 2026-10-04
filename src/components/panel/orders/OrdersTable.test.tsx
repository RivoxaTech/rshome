// @vitest-environment jsdom
/**
 * S22 BUG-04: the phone-width order card navigates to the order on click, and renders its dialogs
 * inline inside itself — so a click inside an open dialog (Cancel/Reject, Confirm, the backdrop)
 * must never bubble up into that navigation. The desktop row already stopped it; the card didn't.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaffOrderListItem } from "@/features/orders/staff-service";
import { OrdersTable } from "./OrdersTable";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/panel/(protected)/orders/actions", () => ({
  approveOrderAction: vi.fn(),
  reviewProofAction: vi.fn(),
  updateFulfilmentAction: vi.fn(),
  closeOrderAction: vi.fn(),
  addOrderNoteAction: vi.fn(),
  deleteOrderAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
});

/** A COD order in Need review: the trash icon offers Cancel/Reject, Approve is the forward step. */
const item = {
  serial: 1,
  orderNumber: "RSH-261004-TEST",
  placedDate: "4 Oct 2026",
  placedTime: "10:00",
  customerName: "Test Customer",
  total: "PKR 2,500",
  screenshotToCheck: false,
  control: {
    orderNumber: "RSH-261004-TEST",
    isCod: true,
    tab: "need_review",
    statusLabel: "Need review",
    waiting: null,
    actions: [{ action: "approve", target: "processing" }, { action: "cancel", target: "cancelled" }, { action: "reject", target: "rejected" }],
    goodsTotal: "PKR 2,500",
    deliveryCharge: null,
    total: "PKR 2,500",
    goodsProof: null,
    toCheck: [],
    canReviewProofs: true,
    deliveryChargeByTransfer: true,
  },
} as unknown as StaffOrderListItem;

describe("OrdersTable phone card", () => {
  it("keeps clicks inside an open dialog from navigating to the order", async () => {
    const user = userEvent.setup();
    render(<OrdersTable items={[item]} method="cod" backHref="/panel/orders/cod" />);

    // Two trash buttons: the desktop row's and the phone card's (both render; CSS hides one).
    const trashButtons = screen.getAllByRole("button", { name: "Cancel or reject order" });
    expect(trashButtons).toHaveLength(2);
    await user.click(trashButtons[1]);
    expect(push).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: "Cancel or reject order" });
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(screen.getByRole("dialog", { name: "Cancel order" })).toBeInTheDocument();
    await user.click(screen.getByText("Reason (the customer sees this)"));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(dialog).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it("still navigates when the card itself is clicked", async () => {
    const user = userEvent.setup();
    render(<OrdersTable items={[item]} method="cod" backHref="/panel/orders/cod" />);
    await user.click(screen.getAllByText("Test Customer")[1]);
    expect(push).toHaveBeenCalledWith("/panel/orders/cod/RSH-261004-TEST?back=%2Fpanel%2Forders%2Fcod");
  });
});
