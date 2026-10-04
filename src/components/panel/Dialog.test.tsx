// @vitest-environment jsdom
/**
 * S22 QA-01: every modal (the panel Dialog, the proof viewer, the cart drawer, the phone sidebar)
 * goes through `useModal`: focus moves in when it opens, Tab and Shift+Tab stay inside, Esc closes
 * it, the page behind it is `inert`, and focus returns to whatever opened it. The Dialog is the
 * representative here; the proof viewer covers the nested case (a modal opened from a modal).
 */
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";
import { Listbox } from "./Listbox";
import { ProofImage } from "./orders/ProofImage";

afterEach(cleanup);

/** A page with a shell (the inert region), an opener button and a dialog with two controls. */
function Page({ onClose = () => undefined, children }: { onClose?: () => void; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div data-modal-shell>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <button type="button">Elsewhere</button>
      </div>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Example"
      >
        {children ?? (
          <>
            <input aria-label="First" />
            <button type="button">Last</button>
          </>
        )}
      </Dialog>
    </>
  );
}

describe("Dialog (useModal)", () => {
  it("moves focus into the dialog, keeps Tab inside it, and returns focus to the opener on Esc", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);

    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Example" });
    expect(dialog).toHaveFocus();

    // The backdrop is not a tab stop: the first Tab lands on the header's Close button.
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("First")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    // Past the last control, Tab wraps to the first; it never reaches the page behind.
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("marks the shell inert while open and clears it on close", async () => {
    const user = userEvent.setup();
    const { container } = render(<Page />);
    const shell = container.querySelector("[data-modal-shell]") as HTMLElement;
    expect(shell).not.toHaveAttribute("inert");

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(shell).toHaveAttribute("inert");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(shell).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("does not re-steal focus when the dialog re-renders with a new onClose", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByLabelText("First"));
    await user.keyboard("abc"); // typing re-renders the Page (new inline onClose each time)
    expect(screen.getByLabelText("First")).toHaveFocus();
  });

  it("lets an open Listbox inside the dialog take the Esc that closes it, not the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Page onClose={onClose}>
        <Listbox value="1" items={[{ value: "1", label: "One" }]} onChange={() => undefined} ariaLabel="Pick" />
      </Page>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("combobox", { name: "Pick" }));
    expect(screen.getByRole("combobox", { name: "Pick" })).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox", { name: "Pick" })).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stacks: Esc closes only the proof viewer opened from inside a dialog, then the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Page onClose={onClose}>
        <ProofImage proofId={7} label="Products payment screenshot" />
      </Page>,
    );
    const shell = container.querySelector("[data-modal-shell]") as HTMLElement;

    await user.click(screen.getByRole("button", { name: "Open" }));
    const thumbnail = screen.getByRole("button", { name: "View Products payment screenshot full size" });
    await user.click(thumbnail);
    const viewer = screen.getByRole("dialog", { name: "Products payment screenshot" });
    expect(viewer).toHaveFocus();

    // Tab inside the viewer stays on its one control.
    await user.tab();
    expect(screen.getAllByRole("button", { name: "Close" }).at(-1)).toHaveFocus();
    await user.tab();
    expect(screen.getAllByRole("button", { name: "Close" }).at(-1)).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Products payment screenshot" })).not.toBeInTheDocument();
    expect(thumbnail).toHaveFocus();
    expect(shell).toHaveAttribute("inert");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shell).not.toHaveAttribute("inert");
  });
});
