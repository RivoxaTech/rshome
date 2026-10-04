// @vitest-environment jsdom
/**
 * Component test for the shared Listbox (S10 follow-up): proves the hidden input that
 * carries the form value actually changes when an option is chosen (the thing every panel form
 * depends on, now that every native <select> in the panel has been replaced — see CLAUDE.md's
 * "never use a native <select>" rule and ARCHITECTURE.md D52), plus the keyboard behaviour the
 * owner asked for explicitly.
 */
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Listbox, type ListboxItem } from "./Listbox";

// Not using vitest's `globals: true`, so Testing Library's automatic per-test cleanup isn't wired
// up implicitly — without this, each test's render accumulates in the same jsdom document.
afterEach(cleanup);

const ITEMS: ListboxItem[] = [
  { value: "1", label: "Tableware" },
  { value: "2", label: "Tea Sets" },
  { value: "3", label: "Trays" },
];

/** A thin controlled wrapper — `Listbox` itself takes `value`/`onChange`, like a real form field. */
function ControlledListbox(props: { initial?: string; name?: string; placeholder?: string; items?: ListboxItem[] }) {
  const [value, setValue] = useState(props.initial ?? "");
  return <Listbox name={props.name ?? "categoryId"} value={value} items={props.items ?? ITEMS} onChange={setValue} ariaLabel="Category" placeholder={props.placeholder} />;
}

function hiddenInput(container: HTMLElement, name: string): HTMLInputElement {
  return container.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement;
}

describe("Listbox", () => {
  it("posts the value via a hidden input with the given name, and updates it when an option is chosen", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledListbox name="categoryId" />);

    expect(hiddenInput(container, "categoryId")).toHaveValue("");

    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(screen.getByRole("option", { name: "Tea Sets" }));

    expect(hiddenInput(container, "categoryId")).toHaveValue("2");
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Tea Sets");
  });

  it("shows the placeholder, not a blank trigger, while nothing is chosen", () => {
    render(<ControlledListbox placeholder="Choose a category" />);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Choose a category");
  });

  it("shows the current option's label once a value is already set (edit mode)", () => {
    render(<ControlledListbox initial="3" />);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Trays");
  });

  it("opens on Enter, closes on Escape, and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<ControlledListbox />);
    const trigger = screen.getByRole("combobox", { name: "Category" });

    trigger.focus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("moves the highlighted option with arrow keys and confirms it with Enter", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledListbox />);
    const trigger = screen.getByRole("combobox", { name: "Category" });

    trigger.focus();
    await user.keyboard("{ArrowDown}"); // opens, highlights the first option (Tableware)
    expect(trigger).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "Tableware" }).id);

    await user.keyboard("{ArrowDown}"); // highlights Tea Sets
    expect(trigger).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "Tea Sets" }).id);

    await user.keyboard("{Enter}");
    expect(hiddenInput(container, "categoryId")).toHaveValue("2");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("supports a grouped list (group labels are never selectable or counted as options)", async () => {
    const user = userEvent.setup();
    const grouped: ListboxItem[] = [{ groupLabel: "Tableware" }, { value: "10", label: "Plates" }, { value: "11", label: "Bowls" }];
    render(<ControlledListbox items={grouped} />);

    await user.click(screen.getByRole("combobox", { name: "Category" }));
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByRole("option", { name: "Tableware" })).not.toBeInTheDocument();
  });
});
